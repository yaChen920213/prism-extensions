/**
 * 批量压缩套件（Prism 扩展示例·阶段 195）：一个真实可用的行业小工具 + 一条声明式流水线。
 * - batchCompress：批量压缩 asset:// 图片；质量缺省取 prism.storage 记忆值（首次 80），
 *   经 prism.capabilities.run 走 batch-process 能力（本地 sharp，免费），产物归项目产物区。
 * - compress-pipeline：manifest 里的零代码声明式流水线（见 prism-extension.json flows），
 *   本文件不参与其执行——纯展示「无代码也能发布工作流」的一档。
 */
const prism = globalThis.prism

prism.tools.handle('batchCompress', async (args) => {
  const images = Array.isArray(args.images) ? args.images.filter((u) => typeof u === 'string' && u.startsWith('asset://')) : []
  if (images.length === 0) throw new Error('images 不能为空（asset:// 引用列表，用 listAssets 拿引用）')
  if (images.length > 36) throw new Error('单次最多 36 张')
  const remembered = await prism.storage.get('quality')
  const quality =
    typeof args.quality === 'number'
      ? Math.max(30, Math.min(100, Math.round(args.quality)))
      : typeof remembered === 'number'
        ? remembered
        : 80
  const r = await prism.capabilities.run('batch-process', { images, quality })
  if (!r.ok) {
    const reason = (r.nodes && r.nodes[0] && r.nodes[0].error) || r.status || '未知'
    throw new Error(`压缩失败：${reason}`)
  }
  await prism.storage.set('quality', quality)
  prism.log('批量压缩完成', { count: (r.products || []).length, quality })
  return { quality, count: (r.products || []).length, products: r.products || [] }
})
