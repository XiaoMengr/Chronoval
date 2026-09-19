import type { NuxtI18nOptions } from '@nuxtjs/i18n'
import type { LocaleObject } from '@nuxtjs/i18n'
import type { ModuleOptions as DayjsModuleOptions } from 'dayjs-nuxt'
import type { I18nOptions } from 'vue-i18n'

export const defaultLocale = 'en'

type DayjsLocale = NonNullable<DayjsModuleOptions['locales']>[number]

type AppLocaleCode =
  | 'zh-Hans'
  | 'zh-Hant-TW'
  | 'en'
  | 'ko'
  | 'ru'
  | 'vi'

type AppLocaleObject = LocaleObject<AppLocaleCode> & {
  label: string
  language: string
}

export const locales: AppLocaleObject[] = [
  {
    code: 'zh-Hans',
    name: '简体中文',
    label: '简体中文 (Simplified Chinese)',
    file: 'zh-Hans.json',
    language: 'zh',
  },
  {
    code: 'zh-Hant-TW',
    name: '繁體中文',
    label: '繁體中文 (Traditional Chinese)',
    file: 'zh-Hant-TW.json',
    language: 'zh-TW',
  },
  {
    code: 'en',
    name: 'English',
    label: 'English',
    file: 'en.json',
    language: 'en',
  },
  {
    code: 'ko',
    name: '한국어',
    label: '한국어 (Korean)',
    file: 'ko.json',
    language: 'ko',
  },
  {
    code: 'ru',
    name: 'Русский',
    label: 'Русский (Russian)',
    file: 'ru.json',
    language: 'ru',
  },
  {
    code: 'vi',
    name: 'Tiếng Việt',
    label: 'Tiếng Việt (Vietnamese)',
    file: 'vi.json',
    language: 'vi',
  },
]

export const localeLanguages = locales.map(({ language }) => language)
export const dayjsLocales: DayjsLocale[] = [
  'zh-cn',
  'zh-tw',
  'en',
  'ko',
  'ru',
  'vi'
]

export default {
  experimental: {
    localeDetector: 'localeDetector.ts',
  },
  detectBrowserLanguage: {
    fallbackLocale: defaultLocale,
    useCookie: false,
    cookieKey: 'chronoframe-locale',
  },
  strategy: 'no_prefix',
  defaultLocale,
  locales,
  fallbackLocale: {
    'zh-CN': ['zh-Hans'],
    'zh-SG': ['zh-Hans'],
    zh: ['zh-Hans'],
    'zh-Hant': ['zh-Hant-TW'],
    'zh-TW': ['zh-Hant-TW'],
    'zh-HK': ['zh-Hant-TW'],
    'zh-MO': ['zh-Hant-TW'],
    ko: ['en'],
    'ko-KR': ['ko'],
    vi: ['en'],
    'vi-VN': ['vi'],
    default: [defaultLocale],
  },
} satisfies I18nOptions & NuxtI18nOptions
