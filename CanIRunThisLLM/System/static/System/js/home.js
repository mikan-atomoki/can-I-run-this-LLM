document.addEventListener("DOMContentLoaded", function () {
    const modeField = document.getElementById("id_configuration_mode");
    const advancedContainer = document.getElementById("advanced-fields");

    function toggleAdvancedFields() {
        if (modeField.value === "advanced") {
            advancedContainer.style.display = "block";
        } else {
            advancedContainer.style.display = "none";
        }
    }

    toggleAdvancedFields();
    modeField.addEventListener("change", toggleAdvancedFields);
});

document.addEventListener("DOMContentLoaded", function () {
    const modelSelector = document.getElementById("id_selected_llm");
    const llmMapping = window.llmMapping;
    if (modelSelector) {
        modelSelector.addEventListener("change", function () {
            const selectedModel = modelSelector.value;
            if (selectedModel in llmMapping) {
                const config = llmMapping[selectedModel];
                document.getElementById("id_parameters_model").value = config.parameters / 1000000000;
                document.getElementById("id_quantization_level").value = config.quant_level;
                document.getElementById("id_context_window").value = config.context_window;
                document.getElementById("id_cache_bit").value = config.cache_bit;
                document.getElementById("id_num_attention_heads").value = config.model_config.num_attention_heads;
                document.getElementById("id_num_key_value_heads").value = config.model_config.num_key_value_heads;
                document.getElementById("id_hidden_size").value = config.model_config.hidden_size;
                document.getElementById("id_num_hidden_layers").value = config.model_config.num_hidden_layers;
                // Set file_size_gb for GGUF models, clear for base models
                const fileSizeField = document.getElementById("id_file_size_gb");
                if (fileSizeField) {
                    fileSizeField.value = config.file_size_gb || "";
                }
            }
        });
    }
});

// Store fetched GGUF variants globally
window._ggufVariants = [];

function fetchModelInfo() {
    const urlInput = document.getElementById("hf_url_input");
    const statusEl = document.getElementById("fetch_status");
    const badgeEl = document.getElementById("format_badge");
    const variantRow = document.getElementById("gguf-variant-row");
    const fetchBtn = document.getElementById("fetch_model_btn");

    const url = urlInput.value.trim();
    if (!url) {
        statusEl.textContent = "Please enter a HuggingFace URL or repo ID";
        statusEl.style.color = "red";
        return;
    }

    statusEl.textContent = "Fetching model info...";
    statusEl.style.color = "#666";
    fetchBtn.disabled = true;

    fetch("/api/fetch-model/?url=" + encodeURIComponent(url))
        .then(response => response.json())
        .then(data => {
            fetchBtn.disabled = false;

            if (data.error) {
                statusEl.textContent = "Error: " + data.error;
                statusEl.style.color = "red";
                badgeEl.style.display = "none";
                variantRow.style.display = "none";
                return;
            }

            // Show format badge
            badgeEl.style.display = "inline";
            badgeEl.textContent = data.format.toUpperCase();
            if (data.format === "gguf") {
                badgeEl.style.backgroundColor = "#4CAF50";
                badgeEl.style.color = "white";
            } else if (data.format === "gptq") {
                badgeEl.style.backgroundColor = "#2196F3";
                badgeEl.style.color = "white";
            } else if (data.format === "awq") {
                badgeEl.style.backgroundColor = "#FF9800";
                badgeEl.style.color = "white";
            } else {
                badgeEl.style.backgroundColor = "#9E9E9E";
                badgeEl.style.color = "white";
            }

            if (data.format === "gguf") {
                handleGGUFResponse(data);
            } else if (data.format === "gptq" || data.format === "awq") {
                handleQuantizedResponse(data);
            } else {
                handleBaseResponse(data);
            }

            statusEl.textContent = "Model info loaded successfully";
            statusEl.style.color = "green";
        })
        .catch(err => {
            fetchBtn.disabled = false;
            statusEl.textContent = "Fetch failed: " + err.message;
            statusEl.style.color = "red";
        });
}

function handleGGUFResponse(data) {
    const variantRow = document.getElementById("gguf-variant-row");
    const variantSelect = document.getElementById("gguf_variant_select");

    window._ggufVariants = data.variants || [];

    // Populate variant dropdown
    variantSelect.innerHTML = '<option value="">Select a variant</option>';
    data.variants.forEach(function (variant, index) {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = variant.name + " (" + variant.file_size_gb + " GB, " + variant.quant_level + ")";
        variantSelect.appendChild(option);
    });

    variantRow.style.display = "";

    // Auto-fill model config if available from first variant
    if (data.variants.length > 0 && data.variants[0].model_config) {
        fillModelConfig(data.variants[0].model_config);
        const ctxField = document.getElementById("id_context_window");
        if (ctxField) ctxField.value = data.variants[0].context_window || 8192;
    }
}

function selectGGUFVariant() {
    const select = document.getElementById("gguf_variant_select");
    const index = parseInt(select.value);
    if (isNaN(index) || !window._ggufVariants[index]) return;

    const variant = window._ggufVariants[index];

    // Set file_size_gb
    const fileSizeField = document.getElementById("id_file_size_gb");
    if (fileSizeField) fileSizeField.value = variant.file_size_gb;

    // Set quantization level
    const quantField = document.getElementById("id_quantization_level");
    if (quantField) quantField.value = variant.quant_level;

    // Set context window
    const ctxField = document.getElementById("id_context_window");
    if (ctxField) ctxField.value = variant.context_window || 8192;

    // Set cache bit
    const cacheField = document.getElementById("id_cache_bit");
    if (cacheField) cacheField.value = variant.cache_bit || 16;

    // Fill model config if available
    if (variant.model_config) {
        fillModelConfig(variant.model_config);
        // For GGUF with config, we can estimate parameters from file size
        const paramField = document.getElementById("id_parameters_model");
        if (paramField && !paramField.value) {
            // Rough estimate: file_size_gb / bytes_per_weight * 1e9 params
            paramField.value = Math.round(variant.file_size_gb * 2);  // rough fp16 equivalent
        }
    }
}

function handleQuantizedResponse(data) {
    const variantRow = document.getElementById("gguf-variant-row");
    variantRow.style.display = "none";

    const info = data.model_info;

    // Set quantization level
    const quantField = document.getElementById("id_quantization_level");
    if (quantField && info.quant_level) quantField.value = info.quant_level;

    // Set parameters
    const paramField = document.getElementById("id_parameters_model");
    if (paramField && info.parameters) paramField.value = info.parameters / 1e9;

    // Set context window
    const ctxField = document.getElementById("id_context_window");
    if (ctxField) ctxField.value = info.context_window || 8192;

    // Set cache bit
    const cacheField = document.getElementById("id_cache_bit");
    if (cacheField) cacheField.value = info.cache_bit || 16;

    // Set file_size_gb if available
    const fileSizeField = document.getElementById("id_file_size_gb");
    if (fileSizeField && info.file_size_gb) fileSizeField.value = info.file_size_gb;

    // Fill model config
    if (info.model_config) {
        fillModelConfig(info.model_config);
    }
}

function handleBaseResponse(data) {
    const variantRow = document.getElementById("gguf-variant-row");
    variantRow.style.display = "none";

    const info = data.model_info;

    // Clear file_size_gb
    const fileSizeField = document.getElementById("id_file_size_gb");
    if (fileSizeField) fileSizeField.value = "";

    // Set parameters
    const paramField = document.getElementById("id_parameters_model");
    if (paramField && info.parameters && typeof info.parameters === "number") {
        paramField.value = info.parameters / 1e9;
    }

    // Set quantization level
    const quantField = document.getElementById("id_quantization_level");
    if (quantField && info.quant_level) quantField.value = info.quant_level;

    // Set context window
    const ctxField = document.getElementById("id_context_window");
    if (ctxField) ctxField.value = info.context_window || 8192;

    // Set cache bit
    const cacheField = document.getElementById("id_cache_bit");
    if (cacheField) cacheField.value = info.cache_bit || 16;

    // Fill model config
    if (info.model_config && typeof info.model_config === "object") {
        fillModelConfig(info.model_config);
    }
}

function fillModelConfig(modelConfig) {
    const fields = {
        "id_num_attention_heads": "num_attention_heads",
        "id_num_key_value_heads": "num_key_value_heads",
        "id_hidden_size": "hidden_size",
        "id_num_hidden_layers": "num_hidden_layers",
    };
    for (const [fieldId, configKey] of Object.entries(fields)) {
        const el = document.getElementById(fieldId);
        if (el && modelConfig[configKey]) {
            el.value = modelConfig[configKey];
        }
    }
}
