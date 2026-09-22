import { ethers } from "ethers";

const RPC_URL = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || "0xb9a1fb6655704821861d405c3e1616b4412015f1";
const PRIVATE_KEY = process.env.KEEPER_PRIVATE_KEY || "";
const DRY_RUN = String(process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
const MAX_SCAN = Math.max(1, Math.min(500, Number(process.env.MAX_SCAN || "200")));

const EXPECTED_CHAIN_ID = 84532n;
const REVIEW_PERIOD = 7 * 24 * 60 * 60;

const ABI = [
  "function nextAgreementId() view returns (uint256)",
  "function agreements(uint256) view returns (address buyer,address seller,uint128 totalAmount,uint128 releasedToSeller,uint64 createdAt,uint32 milestoneCount,uint32 currentMilestone,uint8 state,bytes32 metadataHash,bytes32 disputeHash)",
  "function getMilestone(uint256,uint256) view returns (tuple(uint128 amount,uint64 dueAt,uint64 submittedAt,uint8 state,bytes32 evidenceHash))",
  "function releaseAfterReviewPeriod(uint256 agreementId)"
];

function log(event, data = {}) {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    event,
    ...data
  }));
}

function requireKeeperKey() {
  if (!PRIVATE_KEY) throw new Error("KEEPER_PRIVATE_KEY is required when DRY_RUN=false");
  if (!/^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY)) {
    throw new Error("KEEPER_PRIVATE_KEY has an invalid format");
  }
  return PRIVATE_KEY;
}

async function main() {
  if (!ethers.isAddress(ESCROW_ADDRESS)) throw new Error("ESCROW_ADDRESS is invalid");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();

  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Wrong network: expected Base Sepolia 84532, received ${network.chainId}`);
  }

  const readEscrow = new ethers.Contract(ESCROW_ADDRESS, ABI, provider);
  const next = await readEscrow.nextAgreementId();
  const last = next > 1n ? next - 1n : 0n;
  const first = last > BigInt(MAX_SCAN) ? last - BigInt(MAX_SCAN) + 1n : 1n;
  const now = Math.floor(Date.now() / 1000);

  const eligible = [];

  for (let id = first; id <= last && last > 0n; id++) {
    try {
      const agreement = await readEscrow.agreements(id);

      // AgreementState.InProgress = 3
      if (Number(agreement.state) !== 3) continue;

      const current = Number(agreement.currentMilestone);
      const count = Number(agreement.milestoneCount);
      if (current >= count) continue;

      const milestone = await readEscrow.getMilestone(id, current);

      // MilestoneState.Submitted = 1
      const submittedAt = Number(milestone.submittedAt);
      if (
        Number(milestone.state) === 1 &&
        submittedAt > 0 &&
        now >= submittedAt + REVIEW_PERIOD
      ) {
        eligible.push({ id, current, submittedAt });
      }
    } catch (error) {
      log("scan_error", {
        agreementId: String(id),
        error: error?.shortMessage || error?.message || String(error)
      });
    }
  }

  log("scan_complete", {
    chainId: String(network.chainId),
    escrow: ESCROW_ADDRESS,
    scannedFrom: String(first),
    scannedTo: String(last),
    eligible: eligible.map(x => String(x.id)),
    dryRun: DRY_RUN
  });

  if (DRY_RUN || eligible.length === 0) return;

  const wallet = new ethers.Wallet(requireKeeperKey(), provider);
  const writeEscrow = new ethers.Contract(ESCROW_ADDRESS, ABI, wallet);

  log("keeper_ready", { keeper: wallet.address });

  for (const item of eligible) {
    try {
      // Re-read immediately before sending to avoid stale actions.
      const agreement = await readEscrow.agreements(item.id);
      if (Number(agreement.state) !== 3) continue;

      const current = Number(agreement.currentMilestone);
      if (current !== item.current) continue;

      const milestone = await readEscrow.getMilestone(item.id, current);
      const submittedAt = Number(milestone.submittedAt);
      const currentTime = Math.floor(Date.now() / 1000);

      if (
        Number(milestone.state) !== 1 ||
        submittedAt <= 0 ||
        currentTime < submittedAt + REVIEW_PERIOD
      ) {
        continue;
      }

      // The Escrow V2 contract independently enforces the review window.
      const tx = await writeEscrow.releaseAfterReviewPeriod(item.id);
      log("release_submitted", {
        agreementId: String(item.id),
        txHash: tx.hash
      });

      const receipt = await tx.wait(1);
      log("release_confirmed", {
        agreementId: String(item.id),
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      });
    } catch (error) {
      log("release_error", {
        agreementId: String(item.id),
        error: error?.shortMessage || error?.message || String(error)
      });
    }
  }
}

main().catch(error => {
  log("keeper_fatal", {
    error: error?.stack || error?.message || String(error)
  });
  process.exitCode = 1;
});
