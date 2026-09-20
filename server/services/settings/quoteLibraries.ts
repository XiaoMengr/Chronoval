import { settingsManager } from './settingsManager'

/** 「随机照片轮经典语录」标签来源 */
export type RandomQuoteTag = 'ancient' | 'modern'
export const RANDOM_QUOTE_TAGS: RandomQuoteTag[] = ['ancient', 'modern']

/** 内置语录库默认值：古诗 / 现代（可在 设置-系统 中编辑） */
export const DEFAULT_QUOTE_LIBRARIES: Record<RandomQuoteTag, string[]> = {
  ancient: [
    '人生得意须尽欢，莫使金樽空对月。',
    '长风破浪会有时，直挂云帆济沧海。',
    '山重水复疑无路，柳暗花明又一村。',
    '行到水穷处，坐看云起时。',
    '花有重开日，人无再少年。',
    '海上生明月，天涯共此时。',
    '但愿人长久，千里共婵娟。',
    '落霞与孤鹜齐飞，秋水共长天一色。',
    '会当凌绝顶，一览众山小。',
    '众里寻他千百度，蓦然回首，那人却在灯火阑珊处。',
  ],
  modern: [
    '按下快门的一瞬间，定格世间美好的瞬间。',
    '相机是时间的收纳盒，快门是记忆的封缄。',
    '把琐碎的日子，过成闪闪发光的照片。',
    '光影绰绰，皆是人间温柔的注脚。',
    '所有的相遇，都是久别重逢。',
    '咔嚓一声，把片刻定格成永恒。',
    '光是宇宙温柔的笔，照片是它写下的诗。',
    '快门落下，世界为我暂停了那么一秒。',
    '照片里藏着的，是回不去的旧日时光。',
    '聚焦的那一瞬，平凡也开始闪闪发光。',
  ],
}

/** 语录库的 settings 键：system 命名空间下的 JSON 值 */
export const QUOTE_LIBRARIES_SETTING_KEY = 'randomWheel.quoteLibraries'

const isTag = (v: unknown): v is RandomQuoteTag =>
  v === 'ancient' || v === 'modern'

/** 读取整个语录库（古诗/现代），自动兜底内置默认值 */
export const getQuoteLibraries = async (): Promise<
  Record<RandomQuoteTag, string[]>
> => {
  const raw = await settingsManager.get<
    Record<string, unknown> | null
  >('system', QUOTE_LIBRARIES_SETTING_KEY, null)

  if (!raw || typeof raw !== 'object') {
    return {
      ancient: [...DEFAULT_QUOTE_LIBRARIES.ancient],
      modern: [...DEFAULT_QUOTE_LIBRARIES.modern],
    }
  }

  const normalize = (tag: RandomQuoteTag): string[] => {
    const list = raw[tag]
    if (!Array.isArray(list)) return [...DEFAULT_QUOTE_LIBRARIES[tag]]
    const clean = list.filter((s): s is string => typeof s === 'string')
    return clean.length ? clean : [...DEFAULT_QUOTE_LIBRARIES[tag]]
  }

  return {
    ancient: normalize('ancient'),
    modern: normalize('modern'),
  }
}

/** 计算某个标签库里生效的语录条数 */
export const getQuoteLibraryCount = async (
  tag: RandomQuoteTag,
): Promise<number> => {
  const libs = await getQuoteLibraries()
  return libs[tag]?.length ?? 0
}

/**
 * 汇总相簿最终要在随机照片轮播放的语录池：
 * - 相簿若选择了语录标签（ancient/modern）→ 使用对应内置库；
 * - 否则若提供了自定义语录（每行一条）→ 使用自定义；
 * - 两者皆无 → 返回空数组（旋转时不再显示语录）。
 * @param tag 相簿保存的语录标签；null=未选
 * @param customQuotes 自定义语录原文（每行一条）；可空
 */
export const resolveRandomQuotesPool = async (
  tag: string | null | undefined,
  customQuotes: string | null | undefined,
): Promise<string[]> => {
  // 标签优先：选了标签就用内置库（忽略自定义，避免重复/混淆）
  if (tag && isTag(tag)) {
    const libs = await getQuoteLibraries()
    return libs[tag]
  }
  // 未选标签 → 若存在自定义语录则使用
  if (typeof customQuotes === 'string' && customQuotes.trim()) {
    return customQuotes
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}