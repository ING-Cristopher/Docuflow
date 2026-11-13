using DocuFlow.Domain.Common;

namespace DocuFlow.Domain.Extraction;

public readonly record struct ConfidenceScore
{
    public const decimal DefaultReviewThreshold = 0.85m;

    public decimal Value { get; }

    public ConfidenceScore(decimal value)
    {
        if (value < 0m || value > 1m)
            throw new DomainException("ConfidenceScore.OutOfRange", "Confidence score must be between 0.0 and 1.0.");

        Value = value;
    }

    public bool IsLowConfidence(decimal threshold = DefaultReviewThreshold) => Value < threshold;
}

