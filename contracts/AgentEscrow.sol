// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AgentEscrow
/// @notice Minimal USDC escrow for agent-to-agent jobs.
/// @dev Amounts are in USDC base units (6 decimals on most deployments).
contract AgentEscrow {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    struct Job {
        address client;
        address provider;
        uint256 amount;
        uint256 deadline;
        bool accepted;
        bool completed;
        bool released;
    }

    mapping(bytes32 => Job) public jobs;

    event JobCreated(
        bytes32 indexed jobId,
        address indexed client,
        address indexed provider,
        uint256 amount,
        uint256 deadline
    );
    event JobAccepted(bytes32 indexed jobId);
    event JobCompleted(bytes32 indexed jobId);
    event PaymentReleased(bytes32 indexed jobId, address indexed provider, uint256 amount);
    event JobRefunded(bytes32 indexed jobId, address indexed client, uint256 amount);

    constructor(address _usdc) {
        require(_usdc != address(0), "Invalid USDC");
        usdc = IERC20(_usdc);
    }

    function createJob(bytes32 jobId, address provider, uint256 amount, uint256 duration) external {
        require(jobs[jobId].client == address(0), "Job exists");
        require(provider != address(0), "Invalid provider");
        require(amount > 0, "Invalid amount");
        require(duration > 0, "Invalid duration");

        uint256 deadline = block.timestamp + duration;

        // Effects
        jobs[jobId] = Job({
            client: msg.sender,
            provider: provider,
            amount: amount,
            deadline: deadline,
            accepted: false,
            completed: false,
            released: false
        });

        // Interactions
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit JobCreated(jobId, msg.sender, provider, amount, deadline);
    }

    function acceptJob(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(job.client != address(0), "No job");
        require(msg.sender == job.provider, "Not provider");
        require(!job.released, "Already settled");
        require(!job.accepted, "Already accepted");
        job.accepted = true;
        emit JobAccepted(jobId);
    }

    function markComplete(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.provider, "Not provider");
        require(job.client != address(0), "No job");
        require(job.accepted, "Not accepted");
        require(!job.completed, "Already completed");
        require(!job.released, "Already settled");

        job.completed = true;
        emit JobCompleted(jobId);
    }

    /// @notice Anyone may call after completion; reduces provider/client gas burden.
    function releasePayment(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(job.client != address(0), "No job");
        require(job.completed, "Not completed");
        require(!job.released, "Already settled");

        // Effects
        job.released = true;

        // Interactions
        usdc.safeTransfer(job.provider, job.amount);

        emit PaymentReleased(jobId, job.provider, job.amount);
    }

    function refundIfExpired(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(job.client != address(0), "No job");
        require(block.timestamp > job.deadline, "Not expired");
        require(!job.completed, "Already completed");
        require(!job.released, "Already settled");

        // Effects
        job.released = true;

        // Interactions
        usdc.safeTransfer(job.client, job.amount);

        emit JobRefunded(jobId, job.client, job.amount);
    }

    // Convenience view helpers
    function getJob(bytes32 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    function isExpired(bytes32 jobId) external view returns (bool) {
        return block.timestamp > jobs[jobId].deadline;
    }

    function canRelease(bytes32 jobId) external view returns (bool) {
        Job storage job = jobs[jobId];
        return job.client != address(0) && job.completed && !job.released;
    }
}
