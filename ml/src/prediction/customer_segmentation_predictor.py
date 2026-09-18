from __future__ import annotations
import json
from pathlib import Path
import joblib
from ml.src.features.customer_segmentation_dataset import load_customer_segmentation_data
class CustomerSegmentationPredictor:
 def __init__(self,model_path:str|Path,metadata_path:str|Path|None=None):
  self.model_path=Path(model_path); self.model=joblib.load(self.model_path); metadata_path=Path(metadata_path) if metadata_path else self.model_path.with_name('customer_segmentation_metadata.json'); self.metadata=json.loads(metadata_path.read_text()); self.features=self.metadata['feature_columns']
 def predict(self,customer_id:str)->dict:
  row=load_customer_segmentation_data(customer_id); values=row[self.features]; cluster=int(self.model.predict(values)[0]); transformed=self.model.named_steps['preprocess'].transform(values); distances=self.model.named_steps['model'].transform(transformed)[0]; score=float(1/(1+distances[cluster]))
  return {'customer_id':str(customer_id),'cluster_id':cluster,'segment_name':self.metadata['segment_names'][str(cluster)],'segment_description':f"{self.metadata['segment_names'][str(cluster)]} based on observed purchase value, frequency, and recency.",'segment_score':round(score,6)}
