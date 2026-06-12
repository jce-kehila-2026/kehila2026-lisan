"""
test_canonical_cache.py

The canonical cache collapses every phrasing of the same low-risk intent to a
single key, so repeat questions never reach the LLM. These tests prove:

  1. key derivation is phrasing-invariant for meaning/translate,
  2. two different phrasings of the same word-meaning question share one answer
     and the second is served as a cache hit,
  3. transient LLM fallbacks are NOT cached, but deterministic OOD rejections
     are (opt-in),
  4. a version bump invalidates the whole cache.
"""
from __future__ import annotations

from services.canonical_cache import (
    CANONICAL_CACHE,
    CanonicalCache,
    canonical_key,
    derive_intent_key,
    derive_ood_key,
)
from services.chat_engine import generate_chat_response
from services.chat_schemas import ChatRequest, ChatResponse, GuardrailReport


def _fresh_response(answer="שלום", fallback=False, reason=None) -> ChatResponse:
    return ChatResponse(
        answerHe=answer,
        answerAr=None,
        fallbackUsed=fallback,
        fallbackReason=reason,
        level="A1",
        model="test",
        provider="test",
        latencyMs=0,
        cacheHit=False,
        routerHit=False,
        contextChunkIds=[],
        guardrail=GuardrailReport(vocabularyLeakage=False, blockedTokens=[]),
    )


def test_derive_intent_key_is_phrasing_invariant():
    # Two different Arabic phrasings asking the meaning of the SAME Hebrew word
    # must collapse to the same canonical key.
    k1 = derive_intent_key("شو يعني בית", "A1")
    k2 = derive_intent_key("ما معنى בית", "A1")
    assert k1 is not None
    assert k1 == k2
    assert k1.startswith("meaning:")
    assert k1.endswith(":A1:v1")


def test_derive_intent_key_distinguishes_level_and_word():
    assert derive_intent_key("شو يعني בית", "A1") != derive_intent_key("شو يعني בית", "A2")
    assert derive_intent_key("شو يعني בית", "A1") != derive_intent_key("شو يعني מים", "A1")


def test_non_low_risk_intent_has_no_key():
    # A free greeting is not a cacheable deterministic intent.
    assert derive_intent_key("שלום מה שלומך", "A1") is None


def test_store_and_lookup_roundtrip():
    cache = CanonicalCache()
    key = canonical_key("meaning", "בית", "A1")
    assert cache.lookup(key) is None
    cache.store(key, _fresh_response("בית זה מקום"))
    hit = cache.lookup(key)
    assert hit is not None
    assert hit.answerHe == "בית זה מקום"


def test_transient_fallback_not_cached_but_ood_is():
    cache = CanonicalCache()
    key = canonical_key("meaning", "בית", "A1")
    # A transient LLM failure must never be frozen into the cache.
    cache.store(key, _fresh_response(fallback=True, reason="PROVIDER_QUOTA"))
    assert cache.lookup(key) is None
    # A deterministic OOD rejection may be cached when opted in.
    ood = canonical_key("ood", "בורסה", "A1")
    cache.store(ood, _fresh_response(fallback=True, reason="OUT_OF_SCOPE"), allow_fallback=True)
    assert cache.lookup(ood) is not None


def test_version_bump_invalidates(monkeypatch):
    import services.canonical_cache as cc
    k_v1 = cc.canonical_key("meaning", "בית", "A1")
    monkeypatch.setattr(cc, "CANONICAL_CACHE_VERSION", "v2")
    k_v2 = cc.canonical_key("meaning", "בית", "A1")
    assert k_v1 != k_v2


def test_derive_ood_key_prefers_blocked_topic():
    key = derive_ood_key("בורסה זה טוב", "A1")
    assert key is not None
    assert key.startswith("ood:בורסה:")


def test_end_to_end_phrasing_invariant_hit():
    CANONICAL_CACHE.clear()
    r1 = generate_chat_response(
        ChatRequest(message="شو يعني בית", level="A1", includeArabic=False)
    )
    r2 = generate_chat_response(
        ChatRequest(message="ما معنى בית", level="A1", includeArabic=False)
    )
    # Same deterministic answer; the second phrasing is served from cache.
    assert r1.answerHe == r2.answerHe
    assert r1.cacheHit is False
    assert r2.cacheHit is True
    # Neither reached the LLM.
    assert r1.fallbackUsed is False
    assert r2.fallbackUsed is False
