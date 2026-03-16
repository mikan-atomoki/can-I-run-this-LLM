import json
import tempfile
from huggingface_hub import hf_hub_download, model_info


# Mapping of quantization bits to quant_level keys
BITS_TO_QUANT_LEVEL = {
    2: "q2",
    3: "q3",
    4: "q4",
    8: "q8",
    16: "fp16",
    32: "fp32",
}


class QuantizedExtractor:
    """Extractor for GPTQ and AWQ quantized models."""

    def __init__(self, repo_id, model_format):
        self.repo_id = repo_id
        self.model_format = model_format  # "gptq" or "awq"

    def _download_json(self, filename):
        """Download and parse a JSON file from the repo."""
        try:
            path = hf_hub_download(
                repo_id=self.repo_id,
                filename=filename,
                local_dir=tempfile.mkdtemp(),
            )
            with open(path, "r") as f:
                return json.load(f)
        except Exception:
            return None

    def extract(self):
        """
        Extract model information from a GPTQ/AWQ repository.
        Returns a dict with model information.
        """
        quant_config = self._download_json("quantize_config.json")
        config = self._download_json("config.json")
        index = self._download_json("model.safetensors.index.json")

        if quant_config is None:
            raise ValueError(
                f"No quantize_config.json found in {self.repo_id}"
            )

        bits = quant_config.get("bits", 4)
        group_size = quant_config.get("group_size", 128)
        quant_level = BITS_TO_QUANT_LEVEL.get(bits, f"q{bits}")

        # Build model config from config.json
        model_config = None
        if config:
            model_config = {
                "num_attention_heads": config.get("num_attention_heads", 0),
                "num_key_value_heads": config.get(
                    "num_key_value_heads",
                    config.get("num_attention_heads", 0),
                ),
                "hidden_size": config.get("hidden_size", 0),
                "num_hidden_layers": config.get("num_hidden_layers", 0),
            }

        # Get parameter count from safetensors index
        parameters = None
        if index and "metadata" in index:
            total_size = index["metadata"].get("total_size")
            if total_size:
                parameters = round(int(total_size) / 2 / 1e9, 2) * 1e9

        # Estimate file size from model info
        file_size_gb = None
        try:
            info = model_info(self.repo_id)
            total_bytes = 0
            if info.siblings:
                for sibling in info.siblings:
                    if sibling.rfilename.endswith(
                        (".safetensors", ".bin", ".pt")
                    ):
                        total_bytes += sibling.size or 0
            if total_bytes > 0:
                file_size_gb = round(total_bytes / (1024**3), 2)
        except Exception:
            pass

        result = {
            "name": self.repo_id.split("/")[-1],
            "model_config": model_config,
            "parameters": int(parameters) if parameters else None,
            "quant_level": quant_level,
            "context_window": config.get("max_position_embeddings", 8192)
            if config
            else 8192,
            "cache_bit": 16,
            "cuda_overhead": 0.5,
            "model_format": self.model_format,
            "bits": bits,
            "group_size": group_size,
            "file_size_gb": file_size_gb,
            "config_available": config is not None,
        }

        return result
