"""
Parses raw incoming SMS text into structured request fields.
Only messages beginning with DR1| are accepted.
"""
from typing import Dict, Any

VALID_TYPES = {
    "SAR", "MED", "FIRE", "MISSING", "EVAC",
    "SHELTER", "FOOD", "CLOTHES", "SUPPLIES", "OTHER",
}
VALID_SEVERITIES = {"C", "M", "L"}


def parse_disaster_sms(sms_body: str) -> Dict[str, Any]:
    """
    Parses:
        DR1|TYPE|SEV|COUNT|LAT|LNG
    or:
        DR1|TYPE|SEV|COUNT|landmark text

    Returns {"error": "..."} on any malformed input.
    """
    parts = sms_body.strip().split("|")

    if len(parts) < 5 or parts[0] != "DR1":
        return {"error": "malformed", "raw": sms_body}

    protocol, type_code, severity, count_str = parts[0], parts[1], parts[2], parts[3]
    location_part = "|".join(parts[4:])

    # Allow TYPE or TYPE:extra
    base_type = type_code.split(":")[0].upper()
    if base_type not in VALID_TYPES:
        return {"error": "invalid_type", "raw": sms_body}

    if severity.upper() not in VALID_SEVERITIES:
        return {"error": "invalid_severity", "raw": sms_body}

    try:
        count = int(count_str)
        if count <= 0:
            return {"error": "invalid_count", "raw": sms_body}
    except ValueError:
        return {"error": "invalid_count", "raw": sms_body}

    location_pieces = location_part.split("|")
    lat, lng, location_source = None, None, "landmark"

    if len(location_pieces) == 2:
        try:
            lat = float(location_pieces[0])
            lng = float(location_pieces[1])
            if -90 <= lat <= 90 and -180 <= lng <= 180:
                location_source = "gps"
            else:
                lat, lng = None, None
        except ValueError:
            pass

    result: Dict[str, Any] = {
        "protocol": protocol,
        "type": base_type,
        "severity": severity.upper(),
        "people_count": count,
        "location_source": location_source,
        "raw_sms": sms_body.strip(),
    }

    if location_source == "gps":
        result["lat"] = lat
        result["lng"] = lng
    else:
        result["landmark_text"] = location_part.strip()

    return result
