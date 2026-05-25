function getTimeFilter(queryStartMs, queryEndMs) {
    const startSec = Math.floor(queryStartMs / 1000);
    const endSec = Math.ceil(queryEndMs / 1000);
    const nowSec = Math.floor(Date.now() / 1000);
    
    return {
        $or: [
            // Valid timestampSeconds in bounds
            { 
                timestampSeconds: { 
                    $gte: Math.max(1700000000, startSec), 
                    $lte: Math.min(nowSec + 300, endSec) 
                } 
            },
            // Fallback to timestamp
            {
                $or: [
                    { timestampSeconds: { $exists: false } },
                    { timestampSeconds: { $lt: 1700000000 } },
                    { timestampSeconds: { $gt: nowSec + 300 } }
                ],
                timestamp: { 
                    $gte: new Date(queryStartMs), 
                    $lte: new Date(queryEndMs) 
                }
            }
        ]
    };
}

function getSanitizedEpochSeconds(doc) {
    if (doc.timestampSeconds > 1700000000 && doc.timestampSeconds < (Date.now()/1000) + 300) {
        return doc.timestampSeconds;
    }
    // Fallback to server timestamp
    return new Date(doc.timestamp).getTime() / 1000;
}

module.exports = {
    getTimeFilter,
    getSanitizedEpochSeconds
};
