from huggingface_hub import model_info


def detect_model_format(repo_id):
    """
    Detect the model format of a HuggingFace repository.
    Returns: "gguf", "gptq", "awq", or "base"
    """
    try:
        info = model_info(repo_id)
    except Exception as e:
        raise ValueError(f"Could not fetch model info for '{repo_id}': {e}")

    # Check for GGUF files
    if info.siblings:
        for sibling in info.siblings:
            if sibling.rfilename.endswith(".gguf"):
                return "gguf"

    # Check for quantize_config.json (GPTQ/AWQ)
    if info.siblings:
        for sibling in info.siblings:
            if sibling.rfilename == "quantize_config.json":
                return _detect_quant_method(repo_id)

    return "base"


def _detect_quant_method(repo_id):
    """Read quantize_config.json to determine if GPTQ or AWQ."""
    import json
    from huggingface_hub import hf_hub_download
    import tempfile

    try:
        config_path = hf_hub_download(
            repo_id=repo_id,
            filename="quantize_config.json",
            local_dir=tempfile.mkdtemp(),
        )
        with open(config_path, "r") as f:
            config = json.load(f)

        quant_method = config.get("quant_method", "").lower()
        if quant_method == "awq":
            return "awq"
        elif quant_method in ("gptq", "marlin"):
            return "gptq"
        return "gptq"  # Default for quantize_config.json presence
    except Exception:
        return "gptq"
