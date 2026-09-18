import json, os, sys, unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import joblib, pandas as pd
ROOT=Path(__file__).resolve().parents[2]; sys.path.insert(0,str(ROOT))
from ml.src.features.customer_segmentation_dataset import FEATURE_COLUMNS
from ml.src.prediction.customer_segmentation_predictor import CustomerSegmentationPredictor
def frame(): return pd.DataFrame([{ 'customer_id':'c1','as_of_date':pd.Timestamp('2026-01-01'), **{f:float(i+1) for i,f in enumerate(FEATURE_COLUMNS)}}])
class Fake:
 def predict(self,x): return [1]
 def transform(self,x): return [[2.,1.]]
class Prep:
 def transform(self,x): return x
class FakePipeline:
 def __init__(self): self.named_steps={'preprocess':Prep(),'model':Fake()}
 def predict(self,x): return self.named_steps['model'].predict(x)
class Tests(unittest.TestCase):
 @unittest.skipUnless(all(os.getenv(x) for x in ('DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD')),'MySQL required')
 def test_mysql_loading(self):
  from ml.src.features.customer_segmentation_dataset import load_customer_segmentation_data
  d=load_customer_segmentation_data(); self.assertEqual(len(d),d.customer_id.nunique()); self.assertFalse(d[list(FEATURE_COLUMNS)].isna().any().any())
 def test_predictor_mapping_and_reload(self):
  with TemporaryDirectory() as d:
   p=Path(d)/'customer_segmentation_model.joblib'; m=Path(d)/'customer_segmentation_metadata.json'; joblib.dump(FakePipeline(),p); m.write_text(json.dumps({'feature_columns':list(FEATURE_COLUMNS),'segment_names':{'1':'At Risk'}})); x=CustomerSegmentationPredictor(p,m)
   with patch('ml.src.prediction.customer_segmentation_predictor.load_customer_segmentation_data',return_value=frame()): r=x.predict('c1')
  self.assertEqual(r['cluster_id'],1); self.assertEqual(r['segment_name'],'At Risk'); self.assertGreater(r['segment_score'],0)
if __name__=='__main__': unittest.main()
