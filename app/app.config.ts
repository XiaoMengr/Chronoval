export default defineAppConfig({
  ui: {
    colors: {
      primary: 'neutral',
      secondary: 'slate',
      neutral: 'neutral',
      info: 'sky',
      success: 'emerald',
      warning: 'amber',
      danger: 'rose',
    },
    button: {
      slots: {
        base: 'cursor-pointer',
      },
      variants: {
        variant: {
          // ghost（悬浮于背景内容上）按钮：点击/悬停/聚焦时不要浮出浅灰背景色，
          // 改为完全透明，避免在照片亮背景上显得发白刺眼。
          // 具体透明规则见 assets/css/tailwind.css 中 .ghost-flat 的选择器。
          ghost: 'ghost-flat',
        },
      },
    },
    popover: {
      slots: {
        content:
          'bg-white/70 dark:bg-neutral-900/50 backdrop-blur-3xl ring-0 shadow-lg border border-neutral-300/50 dark:border-neutral-500/50 rounded-lg',
      },
    },
    card: {
      slots: {
        header: 'font-semibold',
      },
      variants: {
        variant: {
          glassmorphism: {
            root: 'shadow-lg divide-y-0 divide-neutral-300/50 dark:divide-neutral-500/50',
            header: 'p-2 sm:p-2 pb-0!',
            body: 'p-2 sm:p-2',
            footer: 'p-2 sm:p-2',
          },
        },
      },
    },
    formField: {
      slots: {
        label: 'mb-1',
        help: 'mt-0.5',
      },
    },
  },
})
