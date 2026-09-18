"""Read-only invoice and collection intelligence using the existing risk model."""
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
import pandas as pd
from ml.src.data.mysql_loader import load_sql_file, load_query
from ml.src.prediction.payment_delay_predictor import PaymentDelayPredictor

ROOT=Path(__file__).resolve().parents[3]
QUERY=ROOT/"database/queries/invoice_collection_intelligence.sql"
MODELS=ROOT/"ml/models"

class InvoiceCollectionIntelligenceService:
 def __init__(self,predictor=None): self.predictor=predictor or PaymentDelayPredictor(MODELS/"payment_delay_risk_model.joblib")
 def load_data(self):
  d=load_sql_file(QUERY)
  if d.empty or d.invoice_id.duplicated().any(): raise ValueError("Invalid invoice intelligence dataset.")
  return d
 def get_metrics(self,invoice_id):
  d=self.load_data(); x=d.loc[d.invoice_id.astype(str)==str(invoice_id)]
  if x.empty: raise ValueError(f"Invoice not found: {invoice_id}")
  return self.native(x.iloc[0].to_dict()),d
 @staticmethod
 def payment_status(m):
  if m['outstanding_amount']<=0:return 'Fully Paid'
  if m['total_paid']>0:return 'Partially Paid'
  return 'Unpaid'
 @staticmethod
 def overdue(m):
  if m['outstanding_amount']<=0:return {'status':'Paid','days_overdue':0,'overdue_amount':0.0}
  due=int(m['days_until_due'])
  if due>7:return {'status':'Not Due','days_overdue':0,'overdue_amount':0.0}
  if due>=0:return {'status':'Due Soon','days_overdue':0,'overdue_amount':0.0}
  return {'status':'Partially Paid' if m['total_paid']>0 else 'Overdue','days_overdue':-due,'overdue_amount':m['outstanding_amount']}
 def risk(self,invoice_id):
  try:
   r=self.predictor.predict(str(invoice_id)); return {'status':'available','probability':r['risk_probability'],'score':r['risk_score'],'risk_category':r['risk_category']}
  except ValueError:return {'status':'unavailable','probability':None,'score':None,'risk_category':None}
 def collection(self,m,over,risk,portfolio_max):
  comps={'outstanding':35*min(m['outstanding_amount']/portfolio_max,1) if portfolio_max else 0,'overdue':30*min(over['days_overdue']/90,1),'age':10*min(max(int(m['days_until_due'])+0,0)/180,1)}
  # invoice age is calculated from invoice date below, not due-date delta
  comps['age']=10*min((pd.Timestamp.today().normalize()-pd.Timestamp(m['invoice_date'])).days/180,1)
  weights=75
  if risk['status']=='available': comps['risk']=25*risk['score']/100; weights=100
  score=round(sum(comps.values())/weights*100,2)
  priority='Low' if score<25 else 'Medium' if score<50 else 'High' if score<75 else 'Critical'
  status='No Action' if over['status']=='Paid' else 'Critical Collection' if priority=='Critical' else 'Urgent Collection' if priority=='High' else 'Follow Up' if over['status'] in {'Overdue','Partially Paid'} else 'Monitor'
  rec='No collection action required' if status=='No Action' else 'Escalate collection for high-risk overdue invoice' if status in {'Critical Collection','Urgent Collection'} else 'Send payment reminder' if status=='Follow Up' else 'Monitor payment before due date'
  return {'priority_score':score,'priority':priority,'status':status,'recommendation':rec}
 def build(self,invoice_id):
  m,d=self.get_metrics(invoice_id); m['payment_status']=self.payment_status(m); o=self.overdue(m); r=self.risk(invoice_id); mx=float(d.apply(lambda x:max(float(x.invoice_amount)-float(x.total_paid),0),axis=1).max()); c=self.collection(m,o,r,mx)
  out={'invoice_id':str(invoice_id),'invoice':{'customer_id':m['customer_id'],'invoice_amount':m['invoice_amount'],'invoice_date':m['invoice_date'],'due_date':m['due_date'],'payment_terms_days':m['payment_terms_days']},'payment':{'total_paid':m['total_paid'],'outstanding_amount':m['outstanding_amount'],'payment_status':m['payment_status'],'last_payment_date':m['last_payment_date'],'payment_count':m['payment_count']},'overdue':o,'payment_risk':r,'collection':c}
  s=[]
  if o['days_overdue']>0:s.append('Invoice is overdue')
  if m['total_paid']>0 and m['outstanding_amount']>0:s.append('Invoice is partially paid')
  if r['status']=='available' and r['score']>=67:s.append('Customer has elevated payment-delay risk')
  if r['status']=='available' and o['days_overdue']==0 and r['score']>=67:s.append('Payment risk is high despite invoice not being overdue')
  if c['status'] in {'Urgent Collection','Critical Collection'}:s.append('Urgent collection follow-up recommended')
  out['signals']=s; return out
 @staticmethod
 def native(v):
  o={}
  for k,x in v.items():
   if pd.isna(x):o[k]=None
   elif isinstance(x,Decimal):o[k]=float(x)
   elif isinstance(x,(date,datetime,pd.Timestamp)):o[k]=x.isoformat()
   elif hasattr(x,'item'):o[k]=x.item()
   else:o[k]=x
  return o
