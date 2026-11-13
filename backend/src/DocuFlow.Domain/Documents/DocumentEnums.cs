namespace DocuFlow.Domain.Documents;

public enum DocumentType
{
    Unknown = 0,
    Invoice = 1,
    PurchaseOrder = 2,
    Contract = 3,
    Receipt = 4,
    Other = 99
}

public enum DocumentStatus
{
    Uploaded = 1,
    Queued = 2,
    Processing = 3,
    Extracted = 4,
    PendingReview = 5,
    Approved = 6,
    Rejected = 7,
    Failed = 8
}

