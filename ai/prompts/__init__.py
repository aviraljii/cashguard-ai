from .common import build
PROMPTS={d:(lambda x,d=d:build(d,x)) for d in ('customer','invoice_collection','inventory','cash_flow','sales','transaction_anomaly')}
