# Day 2 Chat Benchmark

## Summary
- Requests: 30
- Average internal latency: 0 ms
- P95 internal latency: 0.0 ms
- Average HTTP latency: 1.7 ms
- P95 HTTP latency: 3.0 ms
- Router hit count: 7
- Cache hit count: 5
- Cache hit rate: 0.1667
- No-LLM count: 10
- No-LLM rate: 0.3333
- Crash count: 0
- Vocabulary leakage count: 0

## Results
- b01: status=200 internalLatencyMs=0 httpLatencyMs=4 routerHit=True cacheHit=False fallbackReason=None
- b02: status=200 internalLatencyMs=0 httpLatencyMs=2 routerHit=True cacheHit=False fallbackReason=None
- b03: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=True cacheHit=False fallbackReason=None
- b04: status=200 internalLatencyMs=0 httpLatencyMs=2 routerHit=True cacheHit=False fallbackReason=None
- b05: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=True cacheHit=False fallbackReason=None
- b06: status=200 internalLatencyMs=0 httpLatencyMs=2 routerHit=True cacheHit=True fallbackReason=None
- b07: status=200 internalLatencyMs=0 httpLatencyMs=3 routerHit=True cacheHit=True fallbackReason=None
- b08: status=200 internalLatencyMs=0 httpLatencyMs=2 routerHit=False cacheHit=False fallbackReason=EMPTY_MESSAGE
- b09: status=200 internalLatencyMs=0 httpLatencyMs=2 routerHit=False cacheHit=True fallbackReason=EMPTY_MESSAGE
- b10: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=False cacheHit=False fallbackReason=UNSUPPORTED_LANGUAGE
- b11: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=False cacheHit=False fallbackReason=UNSUPPORTED_LANGUAGE
- b12: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=False cacheHit=False fallbackReason=UNSUPPORTED_LANGUAGE
- b13: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=False cacheHit=False fallbackReason=OUT_OF_SCOPE
- b14: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=False cacheHit=False fallbackReason=OUT_OF_SCOPE
- b15: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=False cacheHit=False fallbackReason=OUT_OF_SCOPE
- b16: status=200 internalLatencyMs=0 httpLatencyMs=2 routerHit=False cacheHit=False fallbackReason=OUT_OF_SCOPE
- b17: status=200 internalLatencyMs=0 httpLatencyMs=3 routerHit=False cacheHit=False fallbackReason=OUT_OF_SCOPE
- b18: status=200 internalLatencyMs=0 httpLatencyMs=2 routerHit=False cacheHit=False fallbackReason=MESSAGE_TOO_LONG
- b19: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=False cacheHit=False fallbackReason=UNSUPPORTED_LANGUAGE
- b20: status=200 internalLatencyMs=0 httpLatencyMs=2 routerHit=False cacheHit=False fallbackReason=UNSUPPORTED_LANGUAGE
- b21: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=False cacheHit=False fallbackReason=UNSUPPORTED_LANGUAGE
- b22: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=False cacheHit=False fallbackReason=OUT_OF_SCOPE
- b23: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=False cacheHit=False fallbackReason=OUT_OF_SCOPE
- b24: status=200 internalLatencyMs=0 httpLatencyMs=2 routerHit=False cacheHit=False fallbackReason=OUT_OF_SCOPE
- b25: status=200 internalLatencyMs=0 httpLatencyMs=2 routerHit=False cacheHit=True fallbackReason=UNSUPPORTED_LANGUAGE
- b26: status=200 internalLatencyMs=0 httpLatencyMs=3 routerHit=False cacheHit=True fallbackReason=EMPTY_MESSAGE
- b27: status=200 internalLatencyMs=0 httpLatencyMs=2 routerHit=False cacheHit=False fallbackReason=UNSUPPORTED_LANGUAGE
- b28: status=200 internalLatencyMs=0 httpLatencyMs=2 routerHit=False cacheHit=False fallbackReason=UNSUPPORTED_LANGUAGE
- b29: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=False cacheHit=False fallbackReason=UNSUPPORTED_LANGUAGE
- b30: status=200 internalLatencyMs=0 httpLatencyMs=1 routerHit=False cacheHit=False fallbackReason=OUT_OF_SCOPE