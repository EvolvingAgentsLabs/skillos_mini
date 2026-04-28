<script lang="ts">
  import ChatView from "$components/ChatView.svelte";
</script>

<main>
  <ChatView />
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: #0a0a0a;
    overflow: hidden;
  }

  main {
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }
</style>
