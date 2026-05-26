# AI-Service Development Tasks

---

## **TASK 1: Implement Response Caching in Chat Engine**

### **Objective**
Reduce API calls and improve response time by caching chat responses for repeated queries.

### **What to Do**
1. Create a new cache layer in `services/chat_cache.py`
2. Implement in-memory cache with TTL (Time-To-Live) of 1 hour
3. Use user query + language level as cache key
4. Store both the full response and metadata (timestamp, hit count)

### **Where to Work**
- File: `ai-service/services/chat_cache.py`
- File: `ai-service/services/chat_engine.py` 
- File: `ai-service/services/chat_provider.py`

### **Implementation Details**
```python
# In chat_cache.py, create:
- CacheManager class with:
  - get_cached_response(query_hash, language_level)
  - set_cached_response(query_hash, language_level, response, ttl=3600)
  - clear_expired_entries()
  - get_cache_stats() -> {hits, misses, size}
```

### **Integration Points**
- In `chat_engine.py`: Check cache BEFORE calling LLM provider
- In `chat_provider.py`: Only call API if cache miss
- In `main.py`: Add `@app.on_event("startup")` to initialize cache

### **How to Test**
1. Test file: `ai-service/tests/test_cache.py`
2. Make same query twice → second should be instant (< 50ms)
3. Test TTL expiry after 1+ hour
4. Test cache stats endpoint: `GET /api/ai/cache/stats`

### **Expected Outcome**
- 70% reduction in Gemini API calls for common queries
- Response time < 100ms for cached queries
- Cache size < 10MB (implement LRU eviction if needed)

---

## **TASK 2: Create Multi-Provider Fallback System**

### **Objective**
Ensure service resilience: if primary LLM provider fails, automatically try backup providers.

### **What to Do**
1. Extend `services/chat_provider.py` to support multiple LLM providers
2. Implement fallback logic: Gemini → Claude → OpenAI
3. Add circuit breaker pattern to detect provider failures
4. Log all provider attempts and failures

### **Where to Work**
- File: `ai-service/services/chat_provider.py`
- File: `ai-service/services/chat_circuit_breaker.py` (already exists)
- File: `ai-service/routes/chat.py`

### **Implementation Details**
```python
# In chat_provider.py:
class ChatProvider:
    PROVIDER_CHAIN = [
        {"name": "gemini", "model": "gemini-2.5-flash-lite", "timeout": 12},
        {"name": "anthropic", "model": "claude-3-5-sonnet-20241022", "timeout": 15},
        {"name": "openai", "model": "gpt-4o-mini", "timeout": 15}
    ]
    
    async def get_response(query, language_level):
        for provider in PROVIDER_CHAIN:
            try:
                response = await call_provider(provider)
                return response
            except ProviderError as e:
                log_failure(provider, e)
                continue
        raise AllProvidersFailedError()
```

### **Testing with Test Files**
- Use: `request-error.json` (simulate provider error)
- Use: `request-policy-1.json`, `request-policy-2.json`, `request-policy-3.json`
- Verify responses in: `response-error.json`, `response-policy-*.json`

### **How to Test**
1. Mock Gemini API to fail → expect fallback to Claude
2. Mock both Gemini & Claude to fail → expect OpenAI
3. Mock all 3 to fail → expect `AllProvidersFailedError`
4. Check logs: `GET /api/ai/logs?provider=gemini&status=failed`

### **Expected Outcome**
- Service availability increases to 99.5%+
- Fallback happens in < 2 seconds
- Clear logging of which provider was used for each request

---

## **TASK 3: Add Per-User Rate Limiting**

### **Objective**
Prevent abuse and control API costs by limiting requests per user.

### **What to Do**
1. Add rate limiting middleware to FastAPI in `main.py`
2. Track requests per user ID: max 10 requests/minute
3. Return 429 (Too Many Requests) when limit exceeded
4. Include retry-after header in response

### **Where to Work**
- File: `ai-service/main.py`
- File: `ai-service/services/chat_cache.py` (reuse cache infrastructure)
- File: `ai-service/routes/chat.py`

### **Implementation Details**
```python
# Add to main.py:
from fastapi import Request, HTTPException

class RateLimiter:
    def __init__(self, max_requests=10, window_seconds=60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = {}  # {user_id: [timestamps]}
    
    def is_allowed(user_id: str) -> bool:
        # Clean old timestamps outside window
        # Count requests in current window
        # Return True if count < max_requests
        pass

# Apply middleware:
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    user_id = request.headers.get("X-User-ID", "anonymous")
    if not rate_limiter.is_allowed(user_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    return await call_next(request)
```

### **How to Test**
1. Send 11 requests rapidly with same `X-User-ID` header
2. Verify 11th request returns 429 with retry-after header
3. Wait 60 seconds, retry → should succeed
4. Different user IDs should have independent limits
5. Test endpoint: `GET /api/ai/rate-limit/status?user_id=test_user`

### **Expected Outcome**
- Consistent rate limiting (10 req/min per user)
- Proper error responses with retry information
- No impact on request latency (< 5ms overhead)

---

## **TASK 4: Enhance RAG System with Semantic Search**

### **Objective**
Improve retrieval quality by using semantic similarity instead of just keyword matching.

### **What to Do**
1. Modify `services/chat_retrieval.py` to compute embeddings
2. Use existing embedding model (from Gemini or local)
3. Add similarity threshold filtering (only return > 0.7 similarity)
4. Rank results by relevance score

### **Where to Work**
- File: `ai-service/services/chat_retrieval.py`
- File: `ai-service/poc/rag-chunks.json` (contains transcript chunks)
- File: `ai-service/data/transcripts/` (transcript source data)

### **Implementation Details**
```python
# In chat_retrieval.py:
class SemanticRetriever:
    def __init__(self, embedding_model="gemini"):
        self.model = embedding_model
        self.chunks = load_chunks("poc/rag-chunks.json")
        self.embeddings = {}  # cache embeddings
    
    async def retrieve(query: str, language_level: str, top_k=3):
        query_embedding = await get_embedding(query)
        scored_chunks = []
        
        for chunk in self.chunks:
            if chunk["level"] != language_level:
                continue
            chunk_embedding = await get_embedding(chunk["text"])
            similarity = cosine_similarity(query_embedding, chunk_embedding)
            
            if similarity > 0.7:  # threshold
                scored_chunks.append({
                    "text": chunk["text"],
                    "score": similarity,
                    "source": chunk["source"]
                })
        
        return sorted(scored_chunks, key=lambda x: x["score"], reverse=True)[:top_k]
```

### **How to Test**
1. Query: "How do I order coffee?" → should retrieve restaurant scenario chunks
2. Query: "Explain verb conjugation" → should retrieve grammar chunks
3. Verify relevance scores > 0.7 for returned chunks
4. Test with different language levels (A1, A2, B1, B2)
5. Benchmark: embedding time < 200ms, retrieval < 500ms total

### **Expected Outcome**
- Relevance scores visible in API responses
- Top-k results are semantically related to query
- 30% improvement in answer quality (measured subjectively)
- Improved performance for out-of-vocabulary queries

---

## **TASK 5: Create Pronunciation Validator**

### **Objective**
Validate user pronunciation attempts against approved vocabulary before sending to Azure Speech Service.

### **What to Do**
1. Load approved vocabulary from `poc/approved-vocabulary.json`
2. Create validation function to check if word is in approved list
3. Add pronunciation checking in `services/pronunciation.py`
4. Return feedback: "word recognized", "similar to", "not in vocabulary"

### **Where to Work**
- File: `ai-service/services/pronunciation.py`
- File: `ai-service/poc/approved-vocabulary.json` (approved words list)
- File: `ai-service/routes/pronunciation.py`

### **Implementation Details**
```python
# In services/pronunciation.py:
class PronunciationValidator:
    def __init__(self):
        self.vocabulary = load_approved_vocabulary("poc/approved-vocabulary.json")
        # vocabulary structure: {level: [words], phonetic: "..."}
    
    def validate_word(word: str, language_level: str):
        """
        Returns: {
            "valid": bool,
            "word": str,
            "level": str,
            "feedback": "exact_match" | "similar_match" | "not_found",
            "suggestions": [similar_words]
        }
        """
        if word in self.vocabulary[language_level]:
            return {"valid": True, "feedback": "exact_match"}
        
        similar = find_similar_words(word, language_level, threshold=0.8)
        if similar:
            return {"valid": False, "feedback": "similar_match", "suggestions": similar}
        
        return {"valid": False, "feedback": "not_found", "suggestions": []}

# In routes/pronunciation.py:
@router.post("/api/ai/pronunciation/validate")
async def validate_pronunciation(word: str, language_level: str):
    result = validator.validate_word(word, language_level)
    return result
```

### **How to Test**
1. POST `/api/ai/pronunciation/validate` with valid word → returns `valid: true`
2. POST with typo/similar word → returns `similar_match` with suggestions
3. POST with random gibberish → returns `not_found`
4. Test different language levels (A1, A2, B1, B2)
5. Test file: `ai-service/tests/test_pronunciation.py`

### **Expected Outcome**
- 95%+ accuracy for word validation
- Fast response (< 50ms per word)
- Helpful suggestions for misspellings
- Reduces false Azure Speech API calls by 40%

---

## **Testing & Validation**

### **Test Files to Use**
- `request-policy-1.json`, `request-policy-2.json`, `request-policy-3.json` → Rate limiting
- `request-error.json` → Fallback strategy
- `request-advanced.json` → Complex queries for RAG
- `pronunciation_poc.py` → Pronunciation testing

### **Expected Test Results**
```bash
# Run all tests
pytest ai-service/tests/ -v

# Expected: all tests pass
# Expected: response time < 500ms for cached queries
# Expected: fallback triggered when primary fails
```

---

## **Delivery Checklist**

- [ ] Task 1: Cache implementation complete & tested
- [ ] Task 2: Fallback system working with all 3 providers
- [ ] Task 3: Rate limiting enforced per user
- [ ] Task 4: Semantic search improving relevance
- [ ] Task 5: Pronunciation validator in place
- [ ] All tests passing
- [ ] Code pushed to git
- [ ] Documentation updated

