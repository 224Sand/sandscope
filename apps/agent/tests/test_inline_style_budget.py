"""The inline-style count may go down and never up.

A design system whose values live in hundreds of inline objects is not a
design system; it is the same scattered values wearing token-shaped syntax.
The extraction is gradual because a nine-file rewrite is unreviewable, so this
holds the line between passes.

A RATCHET rather than a target. A target invites arguing the number down; a
ratchet just fails, and lowering it is the visible act of having improved
something.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps/web/src"

#: Lowered by each extraction pass. Never raised. If a change genuinely needs
#: a new inline style, extract two others in the same commit.
INLINE_STYLE_BUDGET = 148  # lowered each pass, never raised


def count_inline_styles() -> int:
    """Read the files directly rather than shelling out to grep.

    A subprocess here would need an absolute path to satisfy the linter and
    would still depend on the host having GNU-compatible grep flags, for a
    count Python can do in three lines.
    """
    return sum(path.read_text().count("style={{") for path in WEB.rglob("*.tsx"))


def test_inline_styles_never_increase() -> None:
    actual = count_inline_styles()
    assert actual <= INLINE_STYLE_BUDGET, (
        f"{actual} inline style objects, budget is {INLINE_STYLE_BUDGET}. "
        "Extract the value into a class in globals.css rather than raising this."
    )


def test_the_budget_is_not_stale() -> None:
    """A ratchet nobody tightens does nothing.

    If the real count has fallen well below the budget, the budget is lying
    about where the line is -- lower it in the commit that earned it.
    """
    actual = count_inline_styles()
    assert actual > INLINE_STYLE_BUDGET - 25, (
        f"only {actual} inline styles against a budget of {INLINE_STYLE_BUDGET}. "
        "Lower INLINE_STYLE_BUDGET to the real number."
    )
