from typing import Any
import semver
import traceback
import json


def isRedisVersionLowerThan(current_version, minimum_version):
    return semver.VersionInfo.parse(current_version).compare(minimum_version) == -1

def extract_result(job_task, emit_callback):
    try:
        return job_task.result()
    except Exception as e:
        if not str(e).startswith('Connection closed by server'):
            # lets use a simple-but-effective error handling:
            # ignore the job
            traceback.print_exc()
            emit_callback("error", e)

def get_parent_key(opts: dict[str, str]):
    if opts:
        return f"{opts.get('queue')}:{opts.get('id')}"

def parse_json_string_values(input_dict: dict[str, str]) -> dict[str, dict]:
    return {key: json.loads(value) for key, value in input_dict.items()}

def object_to_flat_array(obj: dict[str, Any]) -> list[Any]:
    """
    Converts a dictionary into a flat array where each key is followed by its value.

    Args:
        obj (dict[str, Any]): The input dictionary to flatten.

    Returns:
        list[Any]: A flat list containing keys and values from the dictionary in order.
    """
    arr = []
    for key, value in obj.items():
        arr.append(key)
        arr.append(value)
    return arr
