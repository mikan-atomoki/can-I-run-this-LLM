from .format_detector import detect_model_format
from .gguf_extractor import GGUFExtractor
from .quantized_extractor import QuantizedExtractor
from .extractor import ModelExtractor


def parse_repo_id(url_or_repo_id):
    """Extract repo_id from a URL or return as-is if already a repo_id."""
    if "huggingface.co/" in url_or_repo_id:
        repo_id = url_or_repo_id.split("huggingface.co/")[-1].strip("/")
        # Remove any trailing path segments (e.g., /tree/main)
        parts = repo_id.split("/")
        if len(parts) >= 2:
            repo_id = "/".join(parts[:2])
        return repo_id
    return url_or_repo_id


def create_extractor(url_or_repo_id):
    """
    Factory function that detects the model format and returns the appropriate extractor.

    Returns: (extractor_instance, format_string)
    - For "gguf": returns (GGUFExtractor, "gguf")
    - For "gptq"/"awq": returns (QuantizedExtractor, format)
    - For "base": returns (ModelExtractor, "base")
    """
    repo_id = parse_repo_id(url_or_repo_id)
    model_format = detect_model_format(repo_id)

    if model_format == "gguf":
        return GGUFExtractor(repo_id), "gguf"
    elif model_format in ("gptq", "awq"):
        return QuantizedExtractor(repo_id, model_format), model_format
    else:
        return ModelExtractor(url=url_or_repo_id), "base"
