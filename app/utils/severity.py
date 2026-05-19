def get_severity(score) -> str:
    if score is None:
        return "Low"
    if score >= 9:
        return "Critical"
    if score >= 7:
        return "High"
    if score >= 4:
        return "Medium"
    return "Low"
