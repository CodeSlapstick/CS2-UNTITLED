import re


_UTILITY_NAMES = {
    "smokegrenade": "Smoke Grenade", "flashbang": "Flashbang",
    "highexplosivegrenade": "HE Grenade", "hegrenade": "HE Grenade",
    "molotov": "Molotov", "incendiarygrenade": "Incendiary Grenade",
    "incgrenade": "Incendiary Grenade", "decoygrenade": "Decoy", "decoy": "Decoy",
}


def utility_inventory(items) -> list[str] | None:
    if items is None:
        return None
    result = []
    for item in items:
        key = re.sub(r"[^a-z0-9]", "", str(item).lower().removeprefix("weapon_"))
        if key in _UTILITY_NAMES:
            result.append(_UTILITY_NAMES[key])
    return result
