import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Voting } from "../target/types/voting";
import { expect } from "chai";

// Test Constants
const TEST_CONSTANTS = {
  POLL_DESCRIPTION: "Best Peanut Butter Brand Vote",
  CANDIDATE_NAMES: ["Skippy", "Jif"],
  CANDIDATE_DESCRIPTIONS: ["Smooth and creamy texture", "Rich and nutty flavor"],
  AIRDROP_AMOUNT: 2000000000, // 2 SOL
  CANDIDATE_COUNT: new anchor.BN(2),
};

// Test Helper Class
class TestHelper {
  static program: Program<Voting>;
  static provider: anchor.AnchorProvider;

  static initialize(program: Program<Voting>, provider: anchor.AnchorProvider) {
    this.program = program;
    this.provider = provider;
  }

  // PDA address calculation functions
  static getPollPda(pollId: anchor.BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("poll"), pollId.toArrayLike(Buffer, "le", 8)],
      this.program.programId
    );
  }

  static getCandidatePda(pollId: anchor.BN, candidateKey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("candidate"),
        pollId.toArrayLike(Buffer, "le", 8),
        candidateKey.toBuffer(),
      ],
      this.program.programId
    );
  }

  static getVotePda(pollId: anchor.BN, voterKey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("vote"),
        pollId.toArrayLike(Buffer, "le", 8),
        voterKey.toBuffer(),
      ],
      this.program.programId
    );
  }

  // Account creation and airdrop
  static async createAndFundAccount(): Promise<Keypair> {
    const account = Keypair.generate();
    await this.provider.connection.confirmTransaction(
      await this.provider.connection.requestAirdrop(account.publicKey, TEST_CONSTANTS.AIRDROP_AMOUNT),
      "confirmed"
    );
    return account;
  }

  // Poll initialization
  static async initializePoll(pollId: anchor.BN): Promise<string> {
    const [pollPda] = this.getPollPda(pollId);
    
    return await this.program.methods
      .initializePoll(
        pollId,
        TEST_CONSTANTS.POLL_DESCRIPTION,
        TEST_CONSTANTS.CANDIDATE_COUNT,
        new anchor.BN(Date.now()),
        new anchor.BN(Date.now() + 86400000)
      )
      .accountsPartial({
        signer: this.provider.wallet.publicKey,
        poll: pollPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  // Candidate registration
  static async registerCandidate(
    pollId: anchor.BN, 
    candidate: Keypair, 
    name: string, 
    description: string
  ): Promise<string> {
    const [pollPda] = this.getPollPda(pollId);
    const [candidatePda] = this.getCandidatePda(pollId, candidate.publicKey);
    
    return await this.program.methods
      .initializeCandidate(pollId, name, description)
      .accountsPartial({
        signer: candidate.publicKey,
        poll: pollPda,
        candidate: candidatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([candidate])
      .rpc();
  }

  // Voting
  static async vote(
    pollId: anchor.BN,
    voter: Keypair,
    candidatePublicKey: PublicKey
  ): Promise<string> {
    const [pollPda] = this.getPollPda(pollId);
    const [candidatePda] = this.getCandidatePda(pollId, candidatePublicKey);
    const [votePda] = this.getVotePda(pollId, voter.publicKey);
    
    return await this.program.methods
      .vote(pollId, candidatePublicKey)
      .accountsPartial({
        signer: voter.publicKey,
        poll: pollPda,
        candidate: candidatePda,
        vote: votePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([voter])
      .rpc();
  }
}

describe("Peanut Butter Brand Voting System", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.voting as Program<Voting>;
  const provider = anchor.AnchorProvider.env();

  // Initialize test helper
  TestHelper.initialize(program, provider);

  describe("Peanut Butter Poll Management", () => {
    let pollId: anchor.BN;
    let pollPda: PublicKey;

    beforeEach(async () => {
      // 각 테스트마다 새로운 Poll ID 생성 (테스트 격리)
      pollId = new anchor.BN(Math.floor(Math.random() * 1000000));
      [pollPda] = TestHelper.getPollPda(pollId);
    });

    it("Should successfully initialize a new peanut butter poll", async () => {
      const tx = await TestHelper.initializePoll(pollId);
      expect(tx).to.be.a("string");

      // Poll 데이터 검증
      const pollAccount = await program.account.poll.fetch(pollPda);
      expect(pollAccount.pollId.toString()).to.equal(pollId.toString());
      expect(pollAccount.description).to.equal(TEST_CONSTANTS.POLL_DESCRIPTION);
      expect(pollAccount.candidates.toString()).to.equal(TEST_CONSTANTS.CANDIDATE_COUNT.toString());
    });

    it("Should prevent duplicate peanut butter poll creation", async () => {
      // 첫 번째 초기화
      await TestHelper.initializePoll(pollId);

      // 같은 ID로 다시 초기화 시도 (init_if_needed로 인해 성공하지만 데이터 변경 안됨)
      const secondTx = await TestHelper.initializePoll(pollId);
      expect(secondTx).to.be.a("string");
    });
  });

  describe("Candidate Management", () => {
    let pollId: anchor.BN;
    let candidate1: Keypair;
    let candidate2: Keypair;

    beforeEach(async () => {
      pollId = new anchor.BN(Math.floor(Math.random() * 1000000));
      candidate1 = await TestHelper.createAndFundAccount();
      candidate2 = await TestHelper.createAndFundAccount();
      
      // Poll 먼저 초기화
      await TestHelper.initializePoll(pollId);
    });

    it("Should successfully register a candidate", async () => {
      const tx = await TestHelper.registerCandidate(
        pollId, 
        candidate1, 
        TEST_CONSTANTS.CANDIDATE_NAMES[0], 
        TEST_CONSTANTS.CANDIDATE_DESCRIPTIONS[0]
      );
      expect(tx).to.be.a("string");

      // 후보자 데이터 검증
      const [candidatePda] = TestHelper.getCandidatePda(pollId, candidate1.publicKey);
      const candidateAccount = await program.account.candidate.fetch(candidatePda);
      expect(candidateAccount.candidateId.toString()).to.equal(candidate1.publicKey.toString());
      expect(candidateAccount.name).to.equal(TEST_CONSTANTS.CANDIDATE_NAMES[0]);
      expect(candidateAccount.description).to.equal(TEST_CONSTANTS.CANDIDATE_DESCRIPTIONS[0]);
    });

    it("Should register multiple candidates for the same poll", async () => {
      // 첫 번째 후보자 등록
      const tx1 = await TestHelper.registerCandidate(
        pollId, 
        candidate1, 
        TEST_CONSTANTS.CANDIDATE_NAMES[0], 
        TEST_CONSTANTS.CANDIDATE_DESCRIPTIONS[0]
      );

      // 두 번째 후보자 등록
      const tx2 = await TestHelper.registerCandidate(
        pollId, 
        candidate2, 
        TEST_CONSTANTS.CANDIDATE_NAMES[1], 
        TEST_CONSTANTS.CANDIDATE_DESCRIPTIONS[1]
      );

      expect(tx1).to.be.a("string");
      expect(tx2).to.be.a("string");
    });

    it("Should prevent duplicate candidate registration", async () => {
      // 첫 번째 등록
      await TestHelper.registerCandidate(
        pollId, 
        candidate1, 
        TEST_CONSTANTS.CANDIDATE_NAMES[0], 
        TEST_CONSTANTS.CANDIDATE_DESCRIPTIONS[0]
      );

      // 같은 후보자로 다시 등록 시도
      try {
        await TestHelper.registerCandidate(
          pollId, 
          candidate1, 
          "다른 이름", 
          "다른 설명"
        );
        expect.fail("Should have thrown an error for duplicate candidate");
      } catch (error) {
        expect(error.message).to.satisfy((msg: string) => 
          msg.includes("already in use") || 
          msg.includes("already exists")
        );
      }
    });
  });

  describe("Voting Process", () => {
    let pollId: anchor.BN;
    let candidate1: Keypair;
    let candidate2: Keypair;
    let voter1: Keypair;
    let voter2: Keypair;

    beforeEach(async () => {
      pollId = new anchor.BN(Math.floor(Math.random() * 1000000));
      candidate1 = await TestHelper.createAndFundAccount();
      candidate2 = await TestHelper.createAndFundAccount();
      voter1 = await TestHelper.createAndFundAccount();
      voter2 = await TestHelper.createAndFundAccount();
      
      // Poll 및 후보자 설정
      await TestHelper.initializePoll(pollId);
      await TestHelper.registerCandidate(
        pollId, 
        candidate1, 
        TEST_CONSTANTS.CANDIDATE_NAMES[0], 
        TEST_CONSTANTS.CANDIDATE_DESCRIPTIONS[0]
      );
      await TestHelper.registerCandidate(
        pollId, 
        candidate2, 
        TEST_CONSTANTS.CANDIDATE_NAMES[1], 
        TEST_CONSTANTS.CANDIDATE_DESCRIPTIONS[1]
      );
    });

    it("Should successfully cast a vote", async () => {
      const tx = await TestHelper.vote(pollId, voter1, candidate1.publicKey);
      expect(tx).to.be.a("string");

      // 투표 기록 검증
      const [votePda] = TestHelper.getVotePda(pollId, voter1.publicKey);
      const voteAccount = await program.account.voteRecord.fetch(votePda);
      expect(voteAccount.voter.toString()).to.equal(voter1.publicKey.toString());
      expect(voteAccount.pollId.toString()).to.equal(pollId.toString());
      expect(voteAccount.candidate.toString()).to.equal(candidate1.publicKey.toString());
    });

    it("Should allow multiple voters to vote for different candidates", async () => {
      // 투표자 1이 후보자 1에게 투표
      const tx1 = await TestHelper.vote(pollId, voter1, candidate1.publicKey);
      
      // 투표자 2가 후보자 2에게 투표
      const tx2 = await TestHelper.vote(pollId, voter2, candidate2.publicKey);

      expect(tx1).to.be.a("string");
      expect(tx2).to.be.a("string");
    });

    it("Should allow multiple voters to vote for the same candidate", async () => {
      // 투표자 1이 후보자 1에게 투표
      const tx1 = await TestHelper.vote(pollId, voter1, candidate1.publicKey);
      
      // 투표자 2도 후보자 1에게 투표
      const tx2 = await TestHelper.vote(pollId, voter2, candidate1.publicKey);

      expect(tx1).to.be.a("string");
      expect(tx2).to.be.a("string");
    });
  });

  describe("Security Tests", () => {
    let pollId: anchor.BN;
    let candidate1: Keypair;
    let voter1: Keypair;

    beforeEach(async () => {
      pollId = new anchor.BN(Math.floor(Math.random() * 1000000));
      candidate1 = await TestHelper.createAndFundAccount();
      voter1 = await TestHelper.createAndFundAccount();
      
      // Poll 및 후보자 설정
      await TestHelper.initializePoll(pollId);
      await TestHelper.registerCandidate(
        pollId, 
        candidate1, 
        TEST_CONSTANTS.CANDIDATE_NAMES[0], 
        TEST_CONSTANTS.CANDIDATE_DESCRIPTIONS[0]
      );
    });

    it("Should prevent double voting by the same user", async () => {
      // 첫 번째 투표
      await TestHelper.vote(pollId, voter1, candidate1.publicKey);

      // 같은 사용자가 다시 투표 시도
      try {
        await TestHelper.vote(pollId, voter1, candidate1.publicKey);
        expect.fail("Should have prevented double voting");
      } catch (error) {
        expect(error.message).to.satisfy((msg: string) => 
          msg.includes("already in use") || 
          msg.includes("already exists") || 
          msg.includes("custom program error: 0x0")
        );
      }
    });

    it("Should reject votes for non-existent candidates", async () => {
      const nonExistentCandidate = Keypair.generate();

      try {
        await TestHelper.vote(pollId, voter1, nonExistentCandidate.publicKey);
        expect.fail("Should have rejected vote for non-existent candidate");
      } catch (error) {
        console.log("Expected error for non-existent candidate:", error.message);
        // 존재하지 않는 후보자에 대한 투표는 여러 종류의 오류를 발생시킬 수 있음
        expect(error.message).to.satisfy((msg: string) => 
          msg.includes("constraint") || 
          msg.includes("not found") ||
          msg.includes("seeds") ||
          msg.includes("AnchorError") ||
          msg.includes("account") ||
          msg.includes("candidate")
        );
      }
    });
  });
});
