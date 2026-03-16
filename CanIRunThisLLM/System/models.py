from django.db import models

class LLMMapping(models.Model):
    name = models.CharField(max_length=255, primary_key=True)
    model_config = models.JSONField()
    parameters = models.BigIntegerField()
    quant_level = models.CharField(max_length=10)
    context_window = models.IntegerField()
    cache_bit = models.IntegerField()
    cuda_overhead = models.IntegerField()
    model_format = models.CharField(max_length=10, default="base")  # "base"/"gguf"/"gptq"/"awq"
    file_size_gb = models.FloatField(null=True, blank=True)  # GGUF file size in GB
    base_model_name = models.CharField(max_length=255, null=True, blank=True)  # Grouping key
    repo_id = models.CharField(max_length=255, null=True, blank=True)  # HF repository ID

    def __str__(self):
        return self.name
    
class AppleMSeriesProcessor(models.Model):
    name = models.CharField(max_length=255, primary_key=True)
    bandwidth = models.FloatField()
