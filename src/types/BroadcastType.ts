export enum BroadcastType {
    // ------------------------
    // Shift lifecycle
    // ------------------------
    SHIFT_CREATED = "SHIFT_CREATED", // New shift added
    SHIFT_UPDATED = "SHIFT_UPDATED", // Shift edited (time, location, skills, headcount)
    SHIFT_DELETED = "SHIFT_DELETED", // Shift removed
    SHIFT_PUBLISHED = "SHIFT_PUBLISHED", // Shift or week's schedule published
    SHIFT_UNPUBLISHED = "SHIFT_UNPUBLISHED", // Shift reverted from published

    // ------------------------
    // Assignments
    // ------------------------
    ASSIGNMENT_ADDED = "ASSIGNMENT_ADDED", // Staff assigned to shift
    ASSIGNMENT_REMOVED = "ASSIGNMENT_REMOVED", // Staff unassigned from shift
    ASSIGNMENT_UPDATED = "ASSIGNMENT_UPDATED", // Reassignment or changes in assignment details

    // ------------------------
    // Swap & Drop Requests
    // ------------------------
    SWAP_REQUEST_CREATED = "SWAP_REQUEST_CREATED", // Swap request created
    SWAP_REQUEST_ACCEPTED = "SWAP_REQUEST_ACCEPTED",
    SWAP_REQUEST_APPROVED = "SWAP_REQUEST_APPROVED", // Swap request approved
    SWAP_REQUEST_REJECTED = "SWAP_REQUEST_REJECTED", // Swap request rejected
    SWAP_REQUEST_CANCELLED = "SWAP_REQUEST_CANCELLED", // Swap request cancelled
    DROP_REQUEST_CREATED = "DROP_REQUEST_CREATED", // Drop request created
    DROP_REQUEST_CLAIMED = "DROP_REQUEST_CLAIMED", // Drop request claimed
    DROP_REQUEST_UPDATED = "DROP_REQUEST_UPDATED", // Claimed, expired, cancelled
    DROP_REQUEST_CANCELLED = "DROP_REQUEST_CANCELLED", // Claimed, expired, cancelled

    // ------------------------
    // Notifications
    // ------------------------
    NOTIFICATION_MADE = "NOTIFICATION_MADE", // Any system notification to user(s)

    // ------------------------
    // On-duty / Live tracking
    // ------------------------
    ON_DUTY_UPDATE = "ON_DUTY_UPDATE", // Updates "on-duty now" dashboard
}
