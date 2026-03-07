<script lang="ts">
  interface Props {
    text: string | null;
    duration?: number;
  }

  let { text, duration = 1200 }: Props = $props();
</script>

{#key text}
  {#if text}
    <div class="splash-wrap" style="--dur: {duration}ms">
      <div class="splash-inner">{text}</div>
    </div>
  {/if}
{/key}

<style>
  .splash-wrap {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 50;
    animation: splash-fade var(--dur) ease-in-out forwards;
  }

  .splash-inner {
    font-family: "Press Start 2P", monospace;
    font-size: clamp(1.2rem, 3.5vw, 3rem);
    color: #f8d830;
    text-shadow:
      -3px -3px 0 #000,
       3px -3px 0 #000,
      -3px  3px 0 #000,
       3px  3px 0 #000,
      -5px  0   0 #000,
       5px  0   0 #000,
       0   -5px 0 #000,
       0    5px 0 #000;
    text-align: center;
    white-space: pre-line;
    width: 100%;
    padding: 1.25rem 2rem;
    background: rgba(0, 0, 0, 0.7);
    border-top: 3px solid #f8d830;
    border-bottom: 3px solid #f8d830;
    animation: splash-scale var(--dur) ease-in-out forwards;
  }

  @keyframes splash-fade {
    0%   { opacity: 0; }
    10%  { opacity: 1; }
    72%  { opacity: 1; }
    100% { opacity: 0; }
  }

  @keyframes splash-scale {
    0%   { transform: scale(0.55); }
    10%  { transform: scale(1.06); }
    18%  { transform: scale(1.0); }
    72%  { transform: scale(1.0); }
    100% { transform: scale(0.95); }
  }
</style>
