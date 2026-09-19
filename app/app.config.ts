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
        // 通知（Toast）：仅精修外观，保留默认配色/状态色与底部进度条。
          // 四角圆弧加大；进度条改为贴合底部的细色线（浅色轨道 + 圆角流畅填充），更精致。
          toast: {
            slots: {
              root: 'relative group overflow-hidden bg-default shadow-lg rounded-2xl ring ring-default p-4 flex gap-2.5 focus:outline-none',
              progress: 'absolute bottom-0 inset-x-0 h-1 overflow-hidden rounded-none bg-neutral-200/60 dark:bg-neutral-800/60',
            },
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
