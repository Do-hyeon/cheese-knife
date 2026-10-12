// Shared, DOM-free style definitions for the settings UI and its writer.
var STYLES: KnifeStyleGroup[] = [
  { id: 'player', styles: [{ id: 'fit-player' }, { id: 'volume-percentage' }, { id: 'hide-ff' }, { id: 'hide-comp' }] },
  { id: 'chat', styles: [{ id: 'chat-resize' }, { id: 'chat-font-size', type: 'range', min: -6, max: 16, step: 1 }, { id: 'chat-timestamp' }, { id: 'hide-ranking' }, { id: 'hide-mission' }, { id: 'left-chat' }] },
  { id: 'sidebar', styles: [{ id: 'hide-offline' }, { id: 'hide-recommended' }, { id: 'hide-schedule' }, { id: 'hide-sidebar-partner' }, { id: 'hide-shortcut' }, { id: 'right-sidebar' }] },
  { id: 'toolbar', styles: [{ id: 'static-logo' }, { id: 'hide-topics' }, { id: 'hide-studio' }, { id: 'auto-hide-toolbar' }] },
  { id: 'home', styles: [{ id: 'hide-recommended-live' }] },
  { id: 'explore', styles: [{ id: 'top-explore' }, { id: 'hide-blocked' }] },
  { id: 'misc', styles: [{ id: 'hide-live-badge' }, { id: 'rectangle-profile' }] },
];
