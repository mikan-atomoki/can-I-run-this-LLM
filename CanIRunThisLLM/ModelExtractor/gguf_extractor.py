import re
import json
import os
import tempfile
from huggingface_hub import model_info, hf_hub_download


# Mapping of GGUF quantization type strings to internal keys
GGUF_QUANT_MAP = {
    "q2_k": "q2_k",
    "q2_k_s": "q2_k",
    "q3_k": "q3_k_m",
    "q3_k_s": "q3_k_s",
    "q3_k_m": "q3_k_m",
    "q3_k_l": "q3_k_l",
    "q4_0": "q4",
    "q4_1": "q4",
    "q4_k": "q4_k_m",
    "q4_k_s": "q4_k_s",
    "q4_k_m": "q4_k_m",
    "q5_0": "q5",
    "q5_1": "q5",
    "q5_k": "q5_k_m",
    "q5_k_s": "q5_k_s",
    "q5_k_m": "q5_k_m",
    "q6_k": "q6_k",
    "q8_0": "q8",
    "q8": "q8",
    "iq1_s": "q1",
    "iq1_m": "q1",
    "iq2_xxs": "q2",
    "iq2_xs": "q2",
    "iq2_s": "q2",
    "iq2_m": "q2_k",
    "iq3_xxs": "q3",
    "iq3_xs": "q3",
    "iq3_s": "q3_k_s",
    "iq3_m": "q3_k_m",
    "iq4_xs": "q4",
    "iq4_nl": "q4",
    "fp16": "fp16",
    "f16": "fp16",
    "bf16": "fp16",
    "fp32": "fp32",
    "f32": "fp32",
}

# Regex to extract quantization type from GGUF filename
GGUF_QUANT_REGEX = re.compile(
    r"[-._]([Qq]\d[_.]?\w*|[Ff](?:16|32)|[Bb][Ff]16|[Ii][Qq]\d[_.]\w+)(?:[-._]|\.gguf)",
    re.IGNORECASE,
)

# Regex to detect split GGUF files
GGUF_SPLIT_REGEX = re.compile(r"-(\d{5})-of-(\d{5})\.gguf$", re.IGNORECASE)


class GGUFExtractor:
    def __init__(self, repo_id):
        self.repo_id = repo_id
        self._info = None

    def _get_info(self):
        if self._info is None:
            self._info = model_info(self.repo_id)
        return self._info

    def _get_gguf_files(self):
        """Return list of (filename, size_bytes) for all .gguf files."""
        info = self._get_info()
        gguf_files = []
        if info.siblings:
            for sibling in info.siblings:
                if sibling.rfilename.endswith(".gguf"):
                    gguf_files.append((sibling.rfilename, sibling.size or 0))
        return gguf_files

    def _parse_quant_type(self, filename):
        """Extract quantization type from filename."""
        match = GGUF_QUANT_REGEX.search(filename)
        if match:
            raw = match.group(1).lower().replace(".", "_")
            return GGUF_QUANT_MAP.get(raw, raw)
        return None

    def _group_split_files(self, gguf_files):
        """
        Group split GGUF files and sum their sizes.
        Returns dict: {variant_base_name: {files: [...], total_size: int}}
        """
        groups = {}
        standalone = []

        for filename, size in gguf_files:
            split_match = GGUF_SPLIT_REGEX.search(filename)
            if split_match:
                # Get base name (remove the split suffix)
                base_name = GGUF_SPLIT_REGEX.sub(".gguf", filename)
                if base_name not in groups:
                    groups[base_name] = {"files": [], "total_size": 0}
                groups[base_name]["files"].append(filename)
                groups[base_name]["total_size"] += size
            else:
                standalone.append((filename, size))

        # Add standalone files as single-file groups
        for filename, size in standalone:
            groups[filename] = {"files": [filename], "total_size": size}

        return groups

    def _get_config_json(self):
        """Try to download config.json for KV cache calculation."""
        try:
            config_path = hf_hub_download(
                repo_id=self.repo_id,
                filename="config.json",
                local_dir=tempfile.mkdtemp(),
            )
            with open(config_path, "r") as f:
                return json.load(f)
        except Exception:
            return None

    def extract_variants(self):
        """
        Extract all GGUF variants from the repository.
        Returns list of dicts with model information for each variant.
        """
        gguf_files = self._get_gguf_files()
        if not gguf_files:
            raise ValueError(f"No GGUF files found in {self.repo_id}")

        groups = self._group_split_files(gguf_files)
        config = self._get_config_json()

        model_config = None
        if config:
            model_config = {
                "num_attention_heads": config.get("num_attention_heads", 0),
                "num_key_value_heads": config.get(
                    "num_key_value_heads", config.get("num_attention_heads", 0)
                ),
                "hidden_size": config.get("hidden_size", 0),
                "num_hidden_layers": config.get("num_hidden_layers", 0),
            }

        variants = []
        for base_name, group_info in sorted(groups.items()):
            quant_level = self._parse_quant_type(base_name)
            if quant_level is None:
                continue

            file_size_gb = round(group_info["total_size"] / (1024**3), 2)

            variant = {
                "name": base_name,
                "file_size_gb": file_size_gb,
                "quant_level": quant_level,
                "model_config": model_config,
                "context_window": config.get("max_position_embeddings", 8192)
                if config
                else 8192,
                "cache_bit": 16,
                "cuda_overhead": 0.5,
                "files": group_info["files"],
                "config_available": config is not None,
            }
            variants.append(variant)

        return variants
