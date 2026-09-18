"""Train CashGuard customer segmentation with K-Means."""
from __future__ import annotations
import json, sys
from datetime import UTC, datetime
from pathlib import Path
import joblib, numpy as np, pandas as pd
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.metrics import silhouette_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler
ROOT=Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path: sys.path.insert(0,str(ROOT))
from ml.src.features.customer_segmentation_dataset import FEATURE_COLUMNS, load_customer_segmentation_data
MODEL_DIR=ROOT/'ml/models'; EVAL_DIR=ROOT/'ml/evaluation/customer_segmentation'; MODEL_PATH=MODEL_DIR/'customer_segmentation_model.joblib'; META_PATH=MODEL_DIR/'customer_segmentation_metadata.json'; REPORT_PATH=EVAL_DIR/'customer_segmentation_evaluation.json'
POSITIVE=tuple(x for x in FEATURE_COLUMNS if x!='sales_growth_rate')
def build(k:int)->Pipeline:
    prep=ColumnTransformer([('log_scaled',Pipeline([('log',FunctionTransformer(np.log1p,feature_names_out='one-to-one')),('scale',StandardScaler())]),list(POSITIVE)),('growth',StandardScaler(),['sales_growth_rate'])])
    return Pipeline([('preprocess',prep),('model',KMeans(n_clusters=k,random_state=42,n_init=20))])
def names(profiles:pd.DataFrame)->dict[str,str]:
    rev=profiles.average_revenue.rank(pct=True); recent=profiles.average_recency_days.rank(pct=True); freq=profiles.average_purchase_frequency.rank(pct=True); result={}
    for cluster,row in profiles.iterrows():
        if rev[cluster]>=.75 and recent[cluster]<=.5: name='High Value Loyal'
        elif rev[cluster]>=.75: name='High Value Infrequent'
        elif recent[cluster]>=.75: name='At Risk'
        elif freq[cluster]>=.6: name='Regular Customers'
        else: name='Low Engagement'
        result[str(cluster)]=name
    return result
def train():
    MODEL_DIR.mkdir(parents=True,exist_ok=True); EVAL_DIR.mkdir(parents=True,exist_ok=True)
    data=load_customer_segmentation_data(); X=data[list(FEATURE_COLUMNS)]
    candidates={}; fitted={}
    for k in range(2,9):
        model=build(k); labels=model.fit_predict(X); sizes=pd.Series(labels).value_counts()
        candidates[k]={'inertia':round(float(model.named_steps['model'].inertia_),2),'silhouette_score':round(float(silhouette_score(model.named_steps['preprocess'].transform(X),labels)),4),'minimum_cluster_size':int(sizes.min())}; fitted[k]=model
    viable=[k for k,v in candidates.items() if v['minimum_cluster_size']>=max(10,int(len(data)*.05))]
    selected=max(viable,key=lambda k:candidates[k]['silhouette_score'])
    model=fitted[selected]; labels=model.predict(X); data['cluster_id']=labels
    profiles=data.groupby('cluster_id').agg(customer_count=('customer_id','size'),average_revenue=('total_sales_value','mean'),median_revenue=('total_sales_value','median'),average_orders=('total_orders','mean'),average_order_value=('average_order_value','mean'),average_recency_days=('recency_days','mean'),average_purchase_frequency=('purchase_frequency','mean')).round(2)
    profiles['percentage']=(profiles.customer_count/len(data)*100).round(2); segment_names=names(profiles)
    profile_rows=[]
    for cluster,row in profiles.iterrows(): profile_rows.append({'cluster_id':int(cluster),'segment_name':segment_names[str(cluster)],**{key:(int(value) if key=='customer_count' else float(value)) for key,value in row.items()}})
    joblib.dump(model,MODEL_PATH)
    metadata={'model_version':'1.0','algorithm':'KMeans','feature_columns':list(FEATURE_COLUMNS),'preprocessing':'log1p then standard scaling for non-negative behavioral features; standard scaling for sales_growth_rate','selected_k':selected,'k_evaluation':candidates,'silhouette_score':candidates[selected]['silhouette_score'],'cluster_sizes':{str(k):int(v) for k,v in pd.Series(labels).value_counts().items()},'cluster_profiles':profile_rows,'segment_names':segment_names,'as_of_date':data.as_of_date.iloc[0].date().isoformat(),'trained_at_utc':datetime.now(UTC).isoformat()}
    META_PATH.write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    REPORT_PATH.write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    return metadata
if __name__=='__main__': print(json.dumps(train(),indent=2))
