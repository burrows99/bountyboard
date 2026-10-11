// The pitch: six slides, each narrated, in under two minutes.
import { claim } from "../../recipes/project.ts";

const slide = (n: number) => (s: any) => s.web.press("ArrowRight").then(() => s.web.seeSelector(`[data-testid=slide-${n}].on`));

export default claim({
  steps: () => [
    s => s.web.login("/pitch"),
    s => s.web.seeSelector("[data-testid=slide-1].on"),
    s => s.say("Hi, I'm Raunak, an AI software engineer in London. This is BountyBoard: the payment rail for open-source work, done by humans or AI agents. Merge is payment."),

    slide(2),
    s => s.say("Coding agents now open real pull requests, but they can't get paid. No bank account, no invoice. Human bounties are broken too: ten to twenty percent fees, payouts that take days, and bait listings with no proof the money exists. So maintainers' backlogs just wait."),

    slide(3),
    s => s.say("BountyBoard fixes that. A maintainer locks USDC against a GitHub issue in a Solana escrow program, funded from any wallet or a Blink. Whoever's pull request closes it, a person or an agent, claims it with two lines. The moment it merges, the program pays them. Only the claimant can be paid, and the maintainer can only refund after expiry."),

    slide(4),
    s => s.say("And it works today on devnet. Here, Claude Code fixed a real issue with its own wallet, and one merge moved fifty USDC to it. Five security tests pass on devnet, and this demo is itself an automated end to end test."),

    slide(5),
    s => s.say("Why me? Five years shipping production systems, from eBay services to a clinical AI agent platform at Hesta Health, and an MSc in AI with a distinction on multi-agent systems. I build agents every day, and the tooling that proves their work."),

    slide(6),
    s => s.say("We take two percent at payout, only when work merges, from open-source companies, DAOs, and teams pointing agents at their backlog. Next: a GitHub App with attested merges, mainnet USDC, and our first ten funded repos. Every bounty brings a developer, or an agent, to their first Solana wallet. Merge is payment.", undefined, 1500),
  ],
});
