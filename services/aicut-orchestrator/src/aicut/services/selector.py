from __future__ import annotations

from dataclasses import replace

from aicut.config import AssemblyConfig
from aicut.domain import CandidateClip, SelectedClip


def _units(seconds: float, step_ms: int) -> int:
    return max(1, round(seconds * 1000 / step_ms))


def _ordered(selected: list[SelectedClip]) -> list[SelectedClip]:
    return sorted(
        selected,
        key=lambda item: (
            item.candidate.order,
            item.final_start_sec,
            item.final_end_sec,
            item.candidate.candidate_id,
        ),
    )


def _trim_from_end(clip: SelectedClip, delta_sec: float) -> tuple[SelectedClip, float]:
    target_end = clip.final_end_sec - delta_sec
    min_end = clip.final_start_sec + 0.2
    candidate = clip.candidate
    word_ends = [word.end_sec for word in candidate.words if clip.final_start_sec < word.end_sec < clip.final_end_sec]
    snapped_end = max((value for value in word_ends if value <= target_end), default=target_end)
    snapped_end = max(min_end, snapped_end)
    removed = clip.final_end_sec - snapped_end
    return replace(clip, final_end_sec=snapped_end), removed


def _extend_from_end(clip: SelectedClip, delta_sec: float, max_extension_sec: float) -> tuple[SelectedClip, float]:
    room = min(max_extension_sec, clip.candidate.hard_end_sec - clip.final_end_sec)
    applied = min(room, delta_sec)
    return replace(clip, final_end_sec=clip.final_end_sec + applied), applied


def _extend_from_start(clip: SelectedClip, delta_sec: float, max_extension_sec: float) -> tuple[SelectedClip, float]:
    room = min(max_extension_sec, clip.final_start_sec - clip.candidate.hard_start_sec)
    applied = min(room, delta_sec)
    return replace(clip, final_start_sec=clip.final_start_sec - applied), applied


def select_clips(candidates: list[CandidateClip], assembly: AssemblyConfig) -> list[SelectedClip]:
    if not candidates:
        raise RuntimeError("No candidates were generated.")

    step_ms = assembly.duration_step_ms
    target_units = _units(assembly.target_duration_sec, step_ms)
    max_over_target_units = _units(assembly.allow_trim_sec, step_ms) if assembly.allow_trim_sec > 0 else 0
    max_total_units = target_units + max_over_target_units
    tolerance_sec = max(0.001, assembly.target_tolerance_sec)
    candidate_units = [_units(candidate.duration_sec, step_ms) for candidate in candidates]

    best: dict[int, tuple[float, list[int]]] = {0: (0.0, [])}
    for index, units in enumerate(candidate_units):
        next_best = dict(best)
        for current_units, (current_score, current_indexes) in best.items():
            new_units = current_units + units
            if new_units > max_total_units:
                continue
            new_score = current_score + candidates[index].score
            existing = next_best.get(new_units)
            if existing is None or new_score > existing[0]:
                next_best[new_units] = (new_score, current_indexes + [index])
        best = next_best

    selected_units = min(
        best.keys(),
        key=lambda item: (
            abs((item * step_ms / 1000) - assembly.target_duration_sec),
            -(best[item][0]),
            abs(item - target_units),
        ),
    )
    selected_indexes = best[selected_units][1]
    if len(selected_indexes) < assembly.min_selected_clips:
        raise RuntimeError("The selector could not produce enough clips.")

    selected = [
        SelectedClip(
            candidate=candidates[index],
            final_start_sec=candidates[index].soft_start_sec,
            final_end_sec=candidates[index].soft_end_sec,
        )
        for index in selected_indexes
    ]
    selected = _ordered(selected)

    delta = assembly.target_duration_sec - sum(item.duration_sec for item in selected)
    if abs(delta) <= tolerance_sec:
        return selected

    if delta > 0:
        remaining = delta
        for index in reversed(range(len(selected))):
            updated, applied = _extend_from_end(selected[index], remaining, assembly.allow_extension_sec)
            selected[index] = updated
            remaining -= applied
            if remaining <= tolerance_sec:
                return selected
        for index in range(len(selected)):
            updated, applied = _extend_from_start(selected[index], remaining, assembly.allow_extension_sec)
            selected[index] = updated
            remaining -= applied
            if remaining <= tolerance_sec:
                return selected
        raise RuntimeError(
            "Could not extend selected clips to the exact target duration within safe boundaries."
        )

    remaining_trim = -delta
    for index in reversed(range(len(selected))):
        updated, removed = _trim_from_end(selected[index], min(remaining_trim, assembly.allow_trim_sec))
        selected[index] = updated
        remaining_trim -= removed
        if remaining_trim <= tolerance_sec:
            return selected

    raise RuntimeError(
        "Could not trim selected clips to the exact target duration without violating safe boundaries."
    )
