// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract StrategyFeedbackFHE is SepoliaConfig {
    // Encrypted feedback structure
    struct EncryptedFeedback {
        euint32 encryptedOpinion; // Encrypted opinion score (1-10)
        euint32 encryptedVote;    // Encrypted vote (0=disagree, 1=agree)
        uint256 timestamp;
        address employee;
    }
    
    // Aggregated results structure
    struct AggregatedResults {
        euint32 totalOpinionScore;
        euint32 totalVotes;
        euint32 agreeCount;
        uint256 lastUpdated;
    }
    
    // Contract state
    uint256 public feedbackCount;
    mapping(uint256 => EncryptedFeedback) public encryptedFeedbacks;
    AggregatedResults public aggregatedResults;
    
    // Decryption requests tracking
    mapping(uint256 => uint256) private requestToFeedbackId;
    
    // Events
    event FeedbackSubmitted(uint256 indexed id, uint256 timestamp);
    event AggregationUpdated(uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event FeedbackDecrypted(uint256 indexed id);
    
    // Initialize aggregated results
    constructor() {
        aggregatedResults.totalOpinionScore = FHE.asEuint32(0);
        aggregatedResults.totalVotes = FHE.asEuint32(0);
        aggregatedResults.agreeCount = FHE.asEuint32(0);
        aggregatedResults.lastUpdated = block.timestamp;
    }
    
    /// @notice Submit encrypted employee feedback
    function submitEncryptedFeedback(
        euint32 encryptedOpinion,
        euint32 encryptedVote
    ) public {
        feedbackCount += 1;
        uint256 newId = feedbackCount;
        
        encryptedFeedbacks[newId] = EncryptedFeedback({
            encryptedOpinion: encryptedOpinion,
            encryptedVote: encryptedVote,
            timestamp: block.timestamp,
            employee: msg.sender
        });
        
        // Update aggregated results with new feedback
        aggregatedResults.totalOpinionScore = FHE.add(
            aggregatedResults.totalOpinionScore,
            encryptedOpinion
        );
        
        aggregatedResults.totalVotes = FHE.add(
            aggregatedResults.totalVotes,
            FHE.asEuint32(1)
        );
        
        aggregatedResults.agreeCount = FHE.add(
            aggregatedResults.agreeCount,
            encryptedVote
        );
        
        aggregatedResults.lastUpdated = block.timestamp;
        
        emit FeedbackSubmitted(newId, block.timestamp);
        emit AggregationUpdated(block.timestamp);
    }
    
    /// @notice Request decryption of a specific feedback
    function requestFeedbackDecryption(uint256 feedbackId) public {
        require(
            msg.sender == encryptedFeedbacks[feedbackId].employee,
            "Only feedback submitter can decrypt"
        );
        
        EncryptedFeedback storage feedback = encryptedFeedbacks[feedbackId];
        
        // Prepare encrypted data for decryption
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(feedback.encryptedOpinion);
        ciphertexts[1] = FHE.toBytes32(feedback.encryptedVote);
        
        // Request decryption
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptFeedback.selector);
        requestToFeedbackId[reqId] = feedbackId;
        
        emit DecryptionRequested(feedbackId);
    }
    
    /// @notice Callback for decrypted feedback data
    function decryptFeedback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 feedbackId = requestToFeedbackId[requestId];
        require(feedbackId != 0, "Invalid request");
        
        // Verify decryption proof
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Process decrypted values
        (uint32 opinion, uint32 vote) = abi.decode(cleartexts, (uint32, uint32));
        
        // Store decrypted values (in real implementation, this would be handled off-chain)
        emit FeedbackDecrypted(feedbackId);
    }
    
    /// @notice Get encrypted aggregated results
    function getAggregatedResults() public view returns (
        euint32 totalOpinionScore,
        euint32 totalVotes,
        euint32 agreeCount,
        uint256 lastUpdated
    ) {
        return (
            aggregatedResults.totalOpinionScore,
            aggregatedResults.totalVotes,
            aggregatedResults.agreeCount,
            aggregatedResults.lastUpdated
        );
    }
    
    /// @notice Request decryption of aggregated results
    function requestAggregatedDecryption() public {
        // Prepare encrypted data for decryption
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(aggregatedResults.totalOpinionScore);
        ciphertexts[1] = FHE.toBytes32(aggregatedResults.totalVotes);
        ciphertexts[2] = FHE.toBytes32(aggregatedResults.agreeCount);
        
        // Request decryption
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAggregated.selector);
        requestToFeedbackId[reqId] = type(uint256).max; // Special ID for aggregated results
    }
    
    /// @notice Callback for decrypted aggregated results
    function decryptAggregated(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 feedbackId = requestToFeedbackId[requestId];
        require(feedbackId == type(uint256).max, "Invalid request");
        
        // Verify decryption proof
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Process decrypted values
        (uint32 totalOpinion, uint32 totalVotes, uint32 agreeCount) = 
            abi.decode(cleartexts, (uint32, uint32, uint32));
        
        // Calculate averages
        uint32 averageOpinion = totalVotes > 0 ? totalOpinion / totalVotes : 0;
        uint32 approvalRate = totalVotes > 0 ? (agreeCount * 100) / totalVotes : 0;
        
        // Emit decrypted results (in real implementation, this would be handled off-chain)
        emit AggregationUpdated(block.timestamp);
    }
}