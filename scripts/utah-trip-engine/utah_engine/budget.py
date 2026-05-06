"""Per-call cost accounting + a hard cap to keep the pilot inside its $10
ceiling. Pricing tracks Anthropic's published rates for the chosen model;
cache reads/writes are billed at the discounted/premium rate accordingly.
"""
from __future__ import annotations

from dataclasses import dataclass

# USD per 1M tokens. Cached reads are 0.1× input; ephemeral cache writes
# are 1.25× input. Sonnet rates included in case we ever switch.
_PRICING: dict[str, dict[str, float]] = {
    "claude-haiku-4-5": {
        "input": 1.00,
        "output": 5.00,
        "cache_write": 1.25,
        "cache_read": 0.10,
    },
    "claude-sonnet-4-6": {
        "input": 3.00,
        "output": 15.00,
        "cache_write": 3.75,
        "cache_read": 0.30,
    },
}


class BudgetExceeded(RuntimeError):
    """Raised when the next call would push spend past the configured cap."""


@dataclass
class TokenUsage:
    input_tokens: int
    output_tokens: int
    cache_write_tokens: int = 0
    cache_read_tokens: int = 0


def call_cost(model: str, usage: TokenUsage) -> float:
    rates = _PRICING.get(model)
    if rates is None:
        raise ValueError(f"No pricing configured for model {model!r}")
    return (
        usage.input_tokens * rates["input"]
        + usage.output_tokens * rates["output"]
        + usage.cache_write_tokens * rates["cache_write"]
        + usage.cache_read_tokens * rates["cache_read"]
    ) / 1_000_000


@dataclass
class Budget:
    """Running spend tracker. ``cap_usd`` is the hard ceiling.

    The ``headroom`` margin keeps us a small distance below the cap so a
    rogue final call can't push us over.
    """

    cap_usd: float
    spent_usd: float = 0.0
    calls: int = 0
    cache_hits: int = 0
    headroom: float = 0.50

    def remaining(self) -> float:
        return max(0.0, self.cap_usd - self.headroom - self.spent_usd)

    def can_afford(self, projected: float) -> bool:
        return self.spent_usd + projected <= self.cap_usd - self.headroom

    def record(self, model: str, usage: TokenUsage) -> float:
        cost = call_cost(model, usage)
        if not self.can_afford(cost):
            raise BudgetExceeded(
                f"Refusing to spend ${cost:.4f} more — running total ${self.spent_usd:.4f} "
                f"would exceed cap ${self.cap_usd:.2f} (headroom ${self.headroom:.2f})."
            )
        self.spent_usd += cost
        self.calls += 1
        return cost

    def note_cache_hit(self) -> None:
        self.cache_hits += 1


def estimate_pass_cost(model: str, snippet_count: int, avg_text_chars: int) -> float:
    """Rough cost estimate for `snippet_count` snippets of `avg_text_chars`.

    Assumes ~4 chars per token, ~600 tokens of (cached) system+tool overhead,
    ~250 tokens of structured output per call.
    """
    rates = _PRICING.get(model, _PRICING["claude-haiku-4-5"])
    avg_input = avg_text_chars / 4.0
    avg_output = 250.0
    cache_overhead = 600.0  # cached after the first call in each 5-min window

    per_call_cost = (
        avg_input * rates["input"]
        + avg_output * rates["output"]
        + cache_overhead * rates["cache_read"]  # most calls hit cache
    ) / 1_000_000

    # First call in each batch pays the cache_write premium once; we round
    # that up to ~3 fresh writes (start + a couple TTL expirations) per
    # 100 snippets to be conservative.
    cache_writes = max(1, snippet_count // 100 * 3)
    write_cost = cache_writes * cache_overhead * rates["cache_write"] / 1_000_000

    return per_call_cost * snippet_count + write_cost
