"""Load, validate, and join the four synthetic CSV datasets.

Design rules:
- Python decides what is valid. Nothing is invented for missing values.
- Bad rows are skipped (or the bad field is ignored) and reported as
  DataQualityWarning objects instead of crashing the app.
- Every record keeps its source identifier and source type so a risk rule
  or an AI statement can point back to the exact row it came from.
- Data freshness and missing-data coverage are calculated per customer.
"""

from __future__ import annotations

import calendar as _cal
import math
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterator

import pandas as pd

from src.config import STALE_DATA_DAYS

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = PROJECT_ROOT / "data"

FILE_NAMES = {
    "crm": "crm.csv",
    "emails": "emails.csv",
    "calendar": "calendar.csv",
    "usage": "usage.csv",
}

REQUIRED_COLUMNS = {
    "crm": [
        "customer_id", "customer_name", "deal_value", "deal_stage",
        "last_contact_date", "renewal_date", "owner",
    ],
    "emails": [
        "email_id", "customer_id", "sent_date", "reply_date", "sentiment", "summary",
    ],
    "calendar": ["meeting_id", "customer_id", "meeting_date", "status", "notes"],
    "usage": ["customer_id", "period", "active_users", "logins", "key_actions"],
}

# Optional columns: the file still loads if they are missing (filled with blanks).
OPTIONAL_COLUMNS = {
    "emails": ["topic_tag"],
}

VALID_SENTIMENTS = {"positive", "neutral", "negative"}
VALID_MEETING_STATUSES = {"scheduled", "completed", "missed", "cancelled"}
VALID_TOPIC_TAGS = {"expansion_request", "premium_feature_interest"}

_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_PERIOD_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


# --------------------------------------------------------------------------
# Data structures
# --------------------------------------------------------------------------
class DataLoadError(Exception):
    """A file is missing or unreadable. The message is written for humans."""


@dataclass(frozen=True)
class DataQualityWarning:
    """One data-quality note.

    severity:
      "error"   -> a record was skipped
      "warning" -> a field was ignored, evidence is missing, or data is stale
      "info"    -> just good to know
    """

    severity: str
    source: str
    record_id: str
    message: str
    customer_id: str | None = None

    def __str__(self) -> str:
        return f"[{self.severity.upper()}] {self.source} {self.record_id}: {self.message}"


@dataclass
class CustomerData:
    customer_id: str
    profile: dict[str, Any]
    emails: list[dict[str, Any]] = field(default_factory=list)
    meetings: list[dict[str, Any]] = field(default_factory=list)
    usage: list[dict[str, Any]] = field(default_factory=list)
    usage_comparison: dict[str, Any] = field(default_factory=dict)
    freshness: dict[str, Any] = field(default_factory=dict)
    coverage: dict[str, Any] = field(default_factory=dict)
    warnings: list[DataQualityWarning] = field(default_factory=list)


@dataclass
class LoadResult:
    customers: dict[str, CustomerData]
    warnings: list[DataQualityWarning]
    as_of: date
    loaded_at: datetime
    source_files: dict[str, dict[str, Any]]


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------
def normalize_customer_id(value: Any) -> str:
    """' c001 ' -> 'C001'. Blank stays blank."""
    return _clean(value).upper()


def _clean(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""  # a short CSV row can produce NaN; treat it as blank
    return str(value).strip()


def parse_iso_date(text: str) -> tuple[date | None, bool]:
    """Return (date, ok). Blank -> (None, True). Malformed -> (None, False)."""
    if text == "":
        return None, True
    if not _DATE_PATTERN.match(text):
        return None, False
    try:
        return date.fromisoformat(text), True
    except ValueError:  # e.g. 2026-13-45
        return None, False


def parse_amount(text: str) -> tuple[float | None, bool]:
    if text == "":
        return None, True
    try:
        value = float(text)
    except ValueError:
        return None, False
    if not math.isfinite(value) or value < 0:
        return None, False
    return value, True


def parse_count(text: str) -> tuple[int | None, bool]:
    """Whole number >= 0. Blank -> (None, True)."""
    if text == "":
        return None, True
    if not re.fullmatch(r"\d+", text):
        return None, False
    return int(text), True


def _add(
    warnings: list[DataQualityWarning],
    severity: str,
    source: str,
    record_id: str,
    message: str,
    customer_id: str | None = None,
) -> None:
    warnings.append(DataQualityWarning(severity, source, record_id, message, customer_id))


# --------------------------------------------------------------------------
# Reading files
# --------------------------------------------------------------------------
def _read_csv(data_dir: Path, key: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    path = data_dir / FILE_NAMES[key]
    if not path.exists():
        raise DataLoadError(
            f"Could not find '{path.name}'. Expected it in: {path.parent}\n"
            "Check that the file exists and the name is spelled exactly like that."
        )
    try:
        # dtype=str + keep_default_na=False: nothing is silently converted, and
        # a blank cell stays "" instead of becoming NaN.
        df = pd.read_csv(
            path, dtype=str, keep_default_na=False,
            skipinitialspace=True, encoding="utf-8-sig",
        )
    except pd.errors.EmptyDataError:
        raise DataLoadError(f"'{path.name}' is empty. It needs at least a header row.") from None
    except (pd.errors.ParserError, UnicodeDecodeError) as exc:
        raise DataLoadError(f"'{path.name}' could not be read as a CSV file: {exc}") from None

    df.columns = [str(c).strip() for c in df.columns]
    required = REQUIRED_COLUMNS[key]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise DataLoadError(
            f"'{path.name}' is missing required column(s): {', '.join(missing)}.\n"
            f"Expected columns: {', '.join(required)}\n"
            f"Found columns:    {', '.join(df.columns)}"
        )

    optional = OPTIONAL_COLUMNS.get(key, [])
    for column in optional:
        if column not in df.columns:
            df[column] = ""

    info = {
        "path": str(path),
        "modified_at": datetime.fromtimestamp(path.stat().st_mtime),
        "row_count": len(df),
    }
    return df[required + optional], info


def _rows(df: pd.DataFrame) -> Iterator[tuple[int, dict[str, str]]]:
    """Yield (row_number_in_file, cleaned_row). Row 1 is the header."""
    for row_number, row in enumerate(df.to_dict("records"), start=2):
        yield row_number, {k: _clean(v) for k, v in row.items()}


# --------------------------------------------------------------------------
# Per-file processing
# --------------------------------------------------------------------------
def _process_crm(df: pd.DataFrame, warnings: list[DataQualityWarning]) -> dict[str, dict[str, Any]]:
    profiles: dict[str, dict[str, Any]] = {}
    for n, row in _rows(df):
        cid = normalize_customer_id(row["customer_id"])
        if not cid:
            _add(warnings, "error", "crm", f"row {n}", "Missing customer_id; row skipped.")
            continue
        if cid in profiles:
            _add(warnings, "error", "crm", cid,
                 f"Duplicate customer_id (row {n}); kept the first occurrence.", cid)
            continue

        name = row["customer_name"]
        if not name:
            _add(warnings, "warning", "crm", cid, "customer_name is blank.", cid)
            name = "(name missing)"

        deal_value, ok = parse_amount(row["deal_value"])
        if not ok:
            _add(warnings, "warning", "crm", cid,
                 f"deal_value '{row['deal_value']}' is not a valid non-negative number; ignored.", cid)
        elif deal_value is None:
            _add(warnings, "info", "crm", cid, "deal_value is blank.", cid)

        parsed_dates: dict[str, date | None] = {}
        for column in ("last_contact_date", "renewal_date"):
            parsed, ok = parse_iso_date(row[column])
            if not ok:
                _add(warnings, "warning", "crm", cid,
                     f"{column} '{row[column]}' is not a valid YYYY-MM-DD date; ignored.", cid)
            elif parsed is None:
                _add(warnings, "info", "crm", cid,
                     f"{column} is blank; rules that need it will be skipped.", cid)
            parsed_dates[column] = parsed

        profiles[cid] = {
            "customer_id": cid,
            "customer_name": name,
            "deal_value": deal_value,
            "deal_stage": row["deal_stage"] or None,
            "last_contact_date": parsed_dates["last_contact_date"],
            "renewal_date": parsed_dates["renewal_date"],
            "owner": row["owner"] or None,
            "source_type": "crm",
            "source_record_id": cid,
        }
    return profiles


def _process_emails(
    df: pd.DataFrame, known_ids: set[str], warnings: list[DataQualityWarning]
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for n, row in _rows(df):
        email_id = row["email_id"]
        label = email_id or f"row {n}"
        cid = normalize_customer_id(row["customer_id"])

        if not email_id:
            _add(warnings, "error", "emails", label, "Missing email_id; row skipped.", cid or None)
            continue
        if not cid:
            _add(warnings, "error", "emails", label, "Missing customer_id; email skipped.")
            continue
        if email_id in seen:
            _add(warnings, "error", "emails", label,
                 f"Duplicate email_id (row {n}); kept the first occurrence.", cid)
            continue
        if cid not in known_ids:
            _add(warnings, "error", "emails", label,
                 f"customer_id '{cid}' not found in crm.csv; email skipped.", cid)
            continue

        sent, ok = parse_iso_date(row["sent_date"])
        if not ok or sent is None:
            _add(warnings, "error", "emails", label,
                 f"sent_date '{row['sent_date']}' is missing or not a valid YYYY-MM-DD date; email skipped.", cid)
            continue

        reply, ok = parse_iso_date(row["reply_date"])
        if not ok:
            # Skipping avoids wrongly treating a badly typed reply as "no reply".
            _add(warnings, "error", "emails", label,
                 f"reply_date '{row['reply_date']}' is not a valid YYYY-MM-DD date; "
                 "email skipped so it is not wrongly treated as unanswered.", cid)
            continue
        if reply is not None and reply < sent:
            _add(warnings, "error", "emails", label,
                 f"reply_date {reply} is before sent_date {sent}; email skipped.", cid)
            continue

        sentiment = row["sentiment"].lower()
        if sentiment and sentiment not in VALID_SENTIMENTS:
            _add(warnings, "warning", "emails", label,
                 f"sentiment '{row['sentiment']}' is not one of {sorted(VALID_SENTIMENTS)}; ignored.", cid)
            sentiment = ""

        topic_tag = row["topic_tag"].lower()
        if topic_tag and topic_tag not in VALID_TOPIC_TAGS:
            _add(warnings, "warning", "emails", label,
                 f"topic_tag '{row['topic_tag']}' is not one of {sorted(VALID_TOPIC_TAGS)}; ignored.", cid)
            topic_tag = ""

        seen.add(email_id)
        records.append({
            "email_id": email_id,
            "customer_id": cid,
            "sent_date": sent,
            "reply_date": reply,  # None means "no reply recorded", NOT "customer refused"
            "sentiment": sentiment or None,
            "summary": row["summary"],  # untrusted text: display only, never obey it
            "topic_tag": topic_tag or None,
            "source_type": "email",
            "source_record_id": email_id,
        })
    return records


def _process_calendar(
    df: pd.DataFrame, known_ids: set[str], warnings: list[DataQualityWarning]
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for n, row in _rows(df):
        meeting_id = row["meeting_id"]
        label = meeting_id or f"row {n}"
        cid = normalize_customer_id(row["customer_id"])

        if not meeting_id:
            _add(warnings, "error", "calendar", label, "Missing meeting_id; row skipped.", cid or None)
            continue
        if not cid:
            _add(warnings, "error", "calendar", label, "Missing customer_id; meeting skipped.")
            continue
        if meeting_id in seen:
            _add(warnings, "error", "calendar", label,
                 f"Duplicate meeting_id (row {n}); kept the first occurrence.", cid)
            continue
        if cid not in known_ids:
            _add(warnings, "error", "calendar", label,
                 f"customer_id '{cid}' not found in crm.csv; meeting skipped.", cid)
            continue

        meeting_date, ok = parse_iso_date(row["meeting_date"])
        if not ok or meeting_date is None:
            _add(warnings, "error", "calendar", label,
                 f"meeting_date '{row['meeting_date']}' is missing or not a valid YYYY-MM-DD date; meeting skipped.", cid)
            continue

        status = row["status"].lower()
        if status not in VALID_MEETING_STATUSES:
            _add(warnings, "error", "calendar", label,
                 f"status '{row['status']}' is not one of {sorted(VALID_MEETING_STATUSES)}; meeting skipped.", cid)
            continue

        seen.add(meeting_id)
        records.append({
            "meeting_id": meeting_id,
            "customer_id": cid,
            "meeting_date": meeting_date,
            "status": status,
            "notes": row["notes"],  # untrusted text
            "source_type": "meeting",
            "source_record_id": meeting_id,
        })
    return records


def _process_usage(
    df: pd.DataFrame, known_ids: set[str], warnings: list[DataQualityWarning]
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for n, row in _rows(df):
        cid = normalize_customer_id(row["customer_id"])
        period = row["period"]
        label = f"{cid}:{period}" if cid and period else f"row {n}"

        if not cid:
            _add(warnings, "error", "usage", label, "Missing customer_id; row skipped.")
            continue
        if cid not in known_ids:
            _add(warnings, "error", "usage", label,
                 f"customer_id '{cid}' not found in crm.csv; row skipped.", cid)
            continue
        if not _PERIOD_PATTERN.match(period):
            _add(warnings, "error", "usage", label,
                 f"period '{period}' must look like YYYY-MM (for example 2026-09); row skipped.", cid)
            continue
        if (cid, period) in seen:
            _add(warnings, "error", "usage", label,
                 f"Duplicate usage record for {cid} in {period} (row {n}); kept the first.", cid)
            continue

        active_users, ok = parse_count(row["active_users"])
        if not ok or active_users is None:
            _add(warnings, "error", "usage", label,
                 f"active_users '{row['active_users']}' is missing or not a whole number >= 0; row skipped.", cid)
            continue

        extras: dict[str, int | None] = {}
        for column in ("logins", "key_actions"):
            value, ok = parse_count(row[column])
            if not ok:
                _add(warnings, "warning", "usage", label,
                     f"{column} '{row[column]}' is not a whole number >= 0; ignored.", cid)
                value = None
            extras[column] = value

        seen.add((cid, period))
        records.append({
            "customer_id": cid,
            "period": period,
            "active_users": active_users,
            "logins": extras["logins"],
            "key_actions": extras["key_actions"],
            "source_type": "usage",
            "source_record_id": f"{cid}:{period}",
        })
    return records


# --------------------------------------------------------------------------
# Usage comparison
# --------------------------------------------------------------------------
def compare_usage(usage_records: list[dict[str, Any]]) -> dict[str, Any]:
    """Compare the latest usage period with the one before it.

    status values:
      "ok"               both periods available, change_pct calculated
      "no_usage_data"    no valid usage rows at all
      "missing_baseline" only one period, so nothing to compare against
      "zero_baseline"    previous period had 0 active users (percent undefined)

    change_pct is signed: -62.5 means active users fell by 62.5 percent,
    +34.5 means they grew by 34.5 percent.
    """
    result: dict[str, Any] = {
        "status": "no_usage_data",
        "latest_period": None, "latest_active_users": None, "latest_record_id": None,
        "previous_period": None, "previous_active_users": None, "previous_record_id": None,
        "change_pct": None,
    }
    ordered = sorted(usage_records, key=lambda r: r["period"])
    if not ordered:
        return result

    latest = ordered[-1]
    result.update(
        status="missing_baseline",
        latest_period=latest["period"],
        latest_active_users=latest["active_users"],
        latest_record_id=latest["source_record_id"],
    )
    if len(ordered) < 2:
        return result

    previous = ordered[-2]
    result.update(
        previous_period=previous["period"],
        previous_active_users=previous["active_users"],
        previous_record_id=previous["source_record_id"],
    )
    if previous["active_users"] == 0:
        result["status"] = "zero_baseline"
    else:
        change = (latest["active_users"] - previous["active_users"]) / previous["active_users"] * 100
        result["status"] = "ok"
        result["change_pct"] = round(change, 2)
    return result


# --------------------------------------------------------------------------
# Data freshness and coverage
# --------------------------------------------------------------------------
def _period_end(period: str) -> date:
    """'2026-09' -> 2026-09-30."""
    year, month = int(period[:4]), int(period[5:7])
    return date(year, month, _cal.monthrange(year, month)[1])


def _freshness_entry(latest_date: date | None, record_id: str | None, today: date) -> dict[str, Any]:
    if latest_date is None:
        return {"latest_record_date": None, "latest_record_id": None,
                "days_old": None, "is_stale": None}
    days_old = (today - latest_date).days
    return {
        "latest_record_date": latest_date,
        "latest_record_id": record_id,
        "days_old": days_old,
        "is_stale": days_old > STALE_DATA_DAYS,
    }


def build_freshness(
    emails: list[dict[str, Any]],
    meetings: list[dict[str, Any]],
    usage: list[dict[str, Any]],
    today: date,
) -> dict[str, Any]:
    """How old is the newest record in each source? None means no data at all.

    This is the newest *record date*, not the time the data was exported.
    Future-dated records (for example scheduled meetings) are ignored here.
    """
    email_date: date | None = None
    email_id: str | None = None
    for e in emails:
        for d in (e["sent_date"], e["reply_date"]):
            if d is not None and d <= today and (email_date is None or d > email_date):
                email_date, email_id = d, e["email_id"]

    meeting_date: date | None = None
    meeting_id: str | None = None
    for m in meetings:
        d = m["meeting_date"]
        if d <= today and (meeting_date is None or d > meeting_date):
            meeting_date, meeting_id = d, m["meeting_id"]

    usage_date: date | None = None
    usage_id: str | None = None
    if usage:
        newest = max(usage, key=lambda r: r["period"])
        usage_date = min(_period_end(newest["period"]), today)
        usage_id = newest["source_record_id"]

    return {
        "emails": _freshness_entry(email_date, email_id, today),
        "calendar": _freshness_entry(meeting_date, meeting_id, today),
        "usage": _freshness_entry(usage_date, usage_id, today),
    }


def build_coverage(
    profile: dict[str, Any],
    emails: list[dict[str, Any]],
    meetings: list[dict[str, Any]],
    comparison: dict[str, Any],
) -> dict[str, Any]:
    """Which inputs exist for this customer? Missing ones are listed in plain words,
    so nobody (including the AI) fills the gap with an assumption."""
    available = {
        "emails": bool(emails),
        "meetings": bool(meetings),
        "usage_comparison": comparison["status"] == "ok",
        "renewal_date": profile["renewal_date"] is not None,
        "last_contact_date": profile["last_contact_date"] is not None,
    }
    labels = {
        "emails": "email records",
        "meetings": "meeting records",
        "usage_comparison": "usage baseline",
        "renewal_date": "renewal date",
        "last_contact_date": "last contact date",
    }
    return {
        "available": available,
        "missing": [labels[key] for key, ok in available.items() if not ok],
    }


# --------------------------------------------------------------------------
# Public entry point
# --------------------------------------------------------------------------
def _group_by_customer(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        grouped.setdefault(record["customer_id"], []).append(record)
    return grouped


def load_all_data(
    data_dir: Path | str = DEFAULT_DATA_DIR,
    today: date | None = None,
) -> LoadResult:
    """Read, validate, and join all four CSV files.

    today: the "as of" date used for data freshness. Defaults to the real date.

    Raises DataLoadError (with a readable message) for problems that make
    loading impossible, such as a missing file or missing column.
    Row-level problems become DataQualityWarning entries instead.
    """
    data_dir = Path(data_dir)
    today = today or date.today()
    warnings: list[DataQualityWarning] = []

    frames: dict[str, pd.DataFrame] = {}
    source_files: dict[str, dict[str, Any]] = {}
    for key in FILE_NAMES:
        frames[key], source_files[key] = _read_csv(data_dir, key)

    profiles = _process_crm(frames["crm"], warnings)
    if not profiles:
        raise DataLoadError("crm.csv contains no valid customers, so there is nothing to analyse.")
    known_ids = set(profiles)

    emails = _group_by_customer(_process_emails(frames["emails"], known_ids, warnings))
    meetings = _group_by_customer(_process_calendar(frames["calendar"], known_ids, warnings))
    usage = _group_by_customer(_process_usage(frames["usage"], known_ids, warnings))

    freshness_labels = {"emails": "email", "calendar": "meeting", "usage": "usage"}
    customers: dict[str, CustomerData] = {}
    for cid, profile in profiles.items():
        c_emails = sorted(emails.get(cid, []), key=lambda r: (r["sent_date"], r["email_id"]))
        c_meetings = sorted(meetings.get(cid, []), key=lambda r: (r["meeting_date"], r["meeting_id"]))
        c_usage = sorted(usage.get(cid, []), key=lambda r: r["period"])
        comparison = compare_usage(c_usage)

        if not c_emails:
            _add(warnings, "info", "emails", cid, "No valid email records for this customer.", cid)
        if not c_meetings:
            _add(warnings, "info", "calendar", cid, "No valid meeting records for this customer.", cid)
        if comparison["status"] == "no_usage_data":
            _add(warnings, "warning", "usage", cid, "No usage data for this customer.", cid)
        elif comparison["status"] == "missing_baseline":
            _add(warnings, "warning", "usage", cid,
                 f"Only one usage period ({comparison['latest_period']}); no baseline to compare.", cid)
        elif comparison["status"] == "zero_baseline":
            _add(warnings, "warning", "usage", cid,
                 f"Previous period ({comparison['previous_period']}) had 0 active users; "
                 "percent change is undefined.", cid)

        freshness = build_freshness(c_emails, c_meetings, c_usage, today)
        for source, entry in freshness.items():
            if entry["is_stale"]:
                _add(warnings, "warning", "freshness", cid,
                     f"Latest {freshness_labels[source]} activity is {entry['days_old']} days old "
                     f"(limit {STALE_DATA_DAYS}); this data may be out of date.", cid)

        customers[cid] = CustomerData(
            customer_id=cid, profile=profile, emails=c_emails, meetings=c_meetings,
            usage=c_usage, usage_comparison=comparison, freshness=freshness,
            coverage=build_coverage(profile, c_emails, c_meetings, comparison),
        )

    for cid, customer in customers.items():
        customer.warnings = [w for w in warnings if w.customer_id == cid]

    return LoadResult(
        customers=customers, warnings=warnings, as_of=today,
        loaded_at=datetime.now(), source_files=source_files,
    )


# --------------------------------------------------------------------------
# Command-line check:  python -m src.data_loader
# --------------------------------------------------------------------------
def describe_usage(comparison: dict[str, Any]) -> str:
    status = comparison["status"]
    if status == "no_usage_data":
        return "no usage data"
    if status == "missing_baseline":
        return f"only one usage period ({comparison['latest_period']}); no baseline to compare"
    if status == "zero_baseline":
        return "previous period had 0 active users; percent change not defined"
    return (
        f"{comparison['previous_period']} -> {comparison['latest_period']}, "
        f"active users {comparison['previous_active_users']} -> {comparison['latest_active_users']} "
        f"({comparison['change_pct']:+.1f}%)"
    )


def describe_freshness(freshness: dict[str, Any]) -> str:
    parts = []
    for key in ("emails", "calendar", "usage"):
        days = freshness[key]["days_old"]
        parts.append(f"{key} {days}d old" if days is not None else f"{key} n/a")
    return " | ".join(parts)


def main() -> int:
    print("Autonomous RevOps Agent - data check")
    try:
        result = load_all_data()
    except DataLoadError as exc:
        print(f"\nCould not load data:\n{exc}")
        return 1

    print(f"Loaded {len(result.customers)} customers from {DEFAULT_DATA_DIR}")
    print(f"As-of date: {result.as_of} (stale-data limit: {STALE_DATA_DAYS} days)\n")
    for cid, c in result.customers.items():
        name = c.profile["customer_name"]
        print(f"{cid}  {name:<20} emails={len(c.emails)}  meetings={len(c.meetings)}  "
              f"usage_periods={len(c.usage)}")
        print(f"      usage: {describe_usage(c.usage_comparison)}")
        print(f"      freshness: {describe_freshness(c.freshness)}")
        missing = ", ".join(c.coverage["missing"]) or "none"
        print(f"      missing: {missing}")

    print(f"\nData-quality notes ({len(result.warnings)}):")
    if not result.warnings:
        print("  none")
    for warning in result.warnings:
        print(f"  {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())