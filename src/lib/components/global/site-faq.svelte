<script lang="ts">
    import * as Accordion from '$lib/components/ui/accordion';

    const { showTitle = true } = $props();

    interface FAQ {
        question: string;
        answer: string[];
        subtext?: string[];
        value: string;
    }

    const faqList: FAQ[] = [
        {
            value: 'What is this website?',
            question: 'What is this website?',
            answer: [
                'This website aims to help players of the video game Old School RuneScape, or OSRS, optimize their ' +
                    'skilling experience, such as for maximizing in-game profits or XP value. ',
                "I do this by comparing your character's metrics (levels, quest completion, etc) to every item that " +
                    'can be made for XP and/or GP, and find what will make you the most of either, making it ' +
                    'potentially useful for both free-trading and ironman accounts.*',
            ],
            subtext: ['* These features are a work in progress. The whole site is, really.'],
        },
        {
            value: 'Does this cost money?',
            question: 'Does this cost money?',
            answer: [
                'No. This is a passion project, not a money-making one. If you would like to donate to the developer, ' +
                    'then thank you, first of all! There is a link at the bottom of the main menu!',
            ],
        },
        {
            value: 'Do I have to make an account?',
            question: 'Do I have to make an account?',
            answer: [
                'Nope! Creating an account is not yet supported, but it will be eventually. The plan is for creating an ' +
                    "account to be optional. It will enable you to save your character's metrics and your favorites so you " +
                    "can access them from any device, but it won't be required to use the site.",
            ],
        },
    ];
</script>

<div class="content-sizing flex flex-col gap-6">
    {#if showTitle}
        <h2 class="font-bold text-xl">Frequently Asked Questions</h2>
    {/if}

    <Accordion.Root type="multiple" class="w-full">
        {#each faqList as faq (faq.question)}
            <Accordion.Item value={faq.question}>
                <Accordion.Trigger>{faq.question}</Accordion.Trigger>
                <Accordion.Content>
                    {#each faq.answer as paragraph, index (index)}
                        <p class="my-6 leading-6">{paragraph}</p>
                    {/each}
                    {#each faq?.subtext ?? [] as subtext, index (index)}
                        <p class="text-muted-foreground">{subtext}</p>
                    {/each}
                </Accordion.Content>
            </Accordion.Item>
        {/each}
    </Accordion.Root>
</div>
