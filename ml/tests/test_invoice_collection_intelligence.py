import sys, unittest
from pathlib import Path
from unittest.mock import Mock, patch
import pandas as pd
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from ml.src.invoice_collection_intelligence import InvoiceCollectionIntelligenceService
M={'invoice_id':'i1','customer_id':'c1','invoice_date':'2026-07-01','due_date':'2026-07-31','invoice_amount':1000.0,'payment_terms_days':30,'total_paid':200.0,'outstanding_amount':800.0,'last_payment_date':'2026-07-15','payment_count':1,'days_until_due':-10,'historical_average_payment_delay':2,'historical_late_payment_rate':.2,'average_settlement_time':20,'previous_late_payment_count':1}
class Tests(unittest.TestCase):
 def s(self):return InvoiceCollectionIntelligenceService(Mock())
 @patch('ml.src.invoice_collection_intelligence.invoice_collection_intelligence_service.load_sql_file')
 def test_lookup_and_invalid(self,l):
  l.return_value=pd.DataFrame([M]);self.assertEqual(self.s().get_metrics('i1')[0]['customer_id'],'c1')
  with self.assertRaises(ValueError):self.s().get_metrics('bad')
 def test_payment_and_overdue_states(self):
  s=self.s();self.assertEqual(s.payment_status(M),'Partially Paid');self.assertEqual(s.overdue(M)['status'],'Partially Paid')
  paid={**M,'total_paid':1000.,'outstanding_amount':0};self.assertEqual(s.overdue(paid)['status'],'Paid')
  due={**M,'total_paid':0.,'outstanding_amount':1000.,'days_until_due':5};self.assertEqual(s.overdue(due)['status'],'Due Soon')
 def test_risk_priority_and_recommendation(self):
  p=Mock();p.predict.return_value={'risk_probability':.8,'risk_score':80,'risk_category':'High'};s=InvoiceCollectionIntelligenceService(p);r=s.risk('i1');self.assertEqual(r['score'],80)
  c=s.collection(M,s.overdue(M),r,1000);self.assertTrue(0<=c['priority_score']<=100);self.assertIn(c['priority'],{'Low','Medium','High','Critical'})
  p.predict.side_effect=ValueError();self.assertIsNone(s.risk('i1')['probability'])
 def test_response_deterministic_and_signals(self):
  s=self.s();s.predictor.predict.return_value={'risk_probability':.8,'risk_score':80,'risk_category':'High'}
  with patch.object(s,'get_metrics',return_value=(M,pd.DataFrame([M]))):a=s.build('i1');b=s.build('i1')
  self.assertEqual(a,b);self.assertIn('Invoice is overdue',a['signals']);self.assertIn('Invoice is partially paid',a['signals'])
if __name__=='__main__':unittest.main()
