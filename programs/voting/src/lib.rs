use anchor_lang::prelude::*;

declare_id!("7SSMPq4S87sYvyHzhUnLp2v3vr5ZaxQx2vCNBaC4cWaa");

#[program]
pub mod voting {
    use super::*;

    pub fn initialize_poll(ctx: Context<InitializePoll>, poll_id: u64, description: String, candidates: u64, start_time: u64, end_time: u64) -> Result<()> {
        let poll = &mut ctx.accounts.poll;
        poll.poll_id = poll_id;
        poll.description = description;
        poll.candidates = candidates;
        poll.start_time = start_time;
        poll.end_time = end_time;

        msg!("Poll initialized successfully");
        msg!("Poll ID: {}", poll.poll_id);
        msg!("Description: {}", poll.description);
        msg!("Candidates: {}", poll.candidates);
        msg!("Start time: {}", poll.start_time);
        msg!("End time: {}", poll.end_time);

        Ok(())
    }

    pub fn initialize_candidate(ctx: Context<InitializeCandidate>, _poll_id: u64, name: String, description: String) -> Result<()> {
        let candidate = &mut ctx.accounts.candidate;
        candidate.candidate_id = ctx.accounts.signer.key();
        candidate.name = name;
        candidate.description = description;

        msg!("Candidate initialized successfully");
        msg!("Candidate ID: {}", candidate.candidate_id);
        msg!("Name: {}", candidate.name);
        msg!("Description: {}", candidate.description);

        Ok(())
    }

    pub fn vote(ctx: Context<Vote>, poll_id: u64, candidate_id: Pubkey) -> Result<()> {
        let vote_record = &mut ctx.accounts.vote;
        vote_record.voter = ctx.accounts.signer.key();
        vote_record.poll_id = poll_id;
        vote_record.candidate = candidate_id;

        msg!("Vote recorded successfully");
        msg!("Voter: {}", vote_record.voter);
        msg!("Poll ID: {}", vote_record.poll_id);
        msg!("Candidate: {}", vote_record.candidate);

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(_poll_id: u64)]
pub struct InitializePoll<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + Poll::INIT_SPACE,
        seeds = [b"poll".as_ref(), _poll_id.to_le_bytes().as_ref()],
        bump
    )]
    pub poll: Account<'info, Poll>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(poll_id: u64)]
pub struct InitializeCandidate<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"poll".as_ref(), poll_id.to_le_bytes().as_ref()],
        bump
    )]
    pub poll: Account<'info, Poll>,
    #[account(
        init,
        payer = signer,
        space = 8 + Candidate::INIT_SPACE,
        seeds = [b"candidate".as_ref(), poll_id.to_le_bytes().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub candidate: Account<'info, Candidate>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(poll_id: u64, candidate_id: Pubkey)]
pub struct Vote<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"poll".as_ref(), poll_id.to_le_bytes().as_ref()],
        bump
    )]
    pub poll: Account<'info, Poll>,
    #[account(
        mut,
        seeds = [b"candidate".as_ref(), poll_id.to_le_bytes().as_ref(), candidate_id.as_ref()],
        bump
    )]
    pub candidate: Account<'info, Candidate>,
    #[account(
        init,
        payer = signer,
        space = 8 + VoteRecord::INIT_SPACE,
        seeds = [b"vote".as_ref(), poll_id.to_le_bytes().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub vote: Account<'info, VoteRecord>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Poll {
    pub poll_id: u64,
    #[max_len(280)]
    pub description: String,
    pub candidates: u64,
    pub start_time: u64,
    pub end_time: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Candidate {
    pub candidate_id: Pubkey,
    #[max_len(280)]
    pub name: String,
    #[max_len(280)]
    pub description: String,
}

#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub voter: Pubkey,
    pub poll_id: u64,
    pub candidate: Pubkey,
}
