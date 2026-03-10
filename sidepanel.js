// API_KEY 从 config.js 中加载
// 请参考 config.example.js 创建你自己的 config.js 文件

// DOM 元素
const extractTitleBtn = document.getElementById('extractTitle');
const extractCommentsBtn = document.getElementById('extractComments');
const startSummaryBtn = document.getElementById('startSummary');
const hintText = document.getElementById('hintText');
const titleResult = document.getElementById('titleResult');
const titleContent = document.getElementById('titleContent');
const commentsResult = document.getElementById('commentsResult');
const commentsContent = document.getElementById('commentsContent');
const summaryResult = document.getElementById('summaryResult');
const summaryContent = document.getElementById('summaryContent');
const loadingSection = document.getElementById('loadingSection');
const exportAllBtn = document.getElementById('exportAllBtn');
const exportSection = document.getElementById('exportSection');
const saveCurrentBtn = document.getElementById('saveCurrentBtn');
const viewSavedBtn = document.getElementById('viewSavedBtn');
const batchExportBtn = document.getElementById('batchExportBtn');
const savedCount = document.getElementById('savedCount');

// 存储提取的数据
let extractedTitle = '';
let extractedComments = [];
let lastExportData = null; // 存储可导出的分析结果
let currentTabUrl = ''; // 当前页面URL

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('侧边栏初始化...');
  checkPageStatus();
  updateSavedCount();
});

// 确保 content script 已注入
async function ensureContentScriptInjected(tabId) {
  try {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          console.log('Content script 未注入，正在注入...');
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          }).then(() => {
            console.log('Content script 注入成功');
            setTimeout(() => resolve(true), 100);
          }).catch((err) => {
            console.error('Content script 注入失败:', err);
            resolve(false);
          });
        } else {
          console.log('Content script 已存在');
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.error('检查 content script 失败:', error);
    return false;
  }
}

// 检测页面状态
async function checkPageStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      disableAllButtons();
      showHint('无法获取页面信息', true);
      return;
    }

    if (!tab.url.includes('xiaohongshu.com')) {
      disableAllButtons();
      showHint('请打开小红书网站', true);
      return;
    }

    currentTabUrl = tab.url;
    enableAllButtons();
    showHint('', false);

  } catch (error) {
    console.error('检测页面状态失败:', error);
    enableAllButtons();
    showHint('', false);
  }
}

// 禁用所有按钮
function disableAllButtons() {
  extractTitleBtn.disabled = true;
  extractCommentsBtn.disabled = true;
  startSummaryBtn.disabled = true;
}

// 启用所有按钮
function enableAllButtons() {
  extractTitleBtn.disabled = false;
  extractCommentsBtn.disabled = false;
  startSummaryBtn.disabled = false;
}

// 显示提示信息
function showHint(text, isError = false) {
  hintText.textContent = text;
  hintText.className = isError ? 'hint-text error' : 'hint-text';
}

// 设置加载状态
function setLoading(isLoading) {
  if (isLoading) {
    loadingSection.classList.remove('hidden');
    extractCommentsBtn.disabled = true;
    startSummaryBtn.disabled = true;
  } else {
    loadingSection.classList.add('hidden');
    enableAllButtons();
  }
}

// 显示/隐藏导出按钮
function updateExportButton() {
  if (lastExportData && (lastExportData.comments || lastExportData.summary)) {
    exportSection.classList.remove('hidden');
    saveCurrentBtn.disabled = false;
  } else {
    exportSection.classList.add('hidden');
    saveCurrentBtn.disabled = true;
  }
}

// 提取标题按钮点击事件
extractTitleBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) {
      showHint('请刷新页面后重试', true);
      return;
    }
    
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: 'extractTitle' }, resolve);
    });
    
    if (chrome.runtime.lastError) {
      console.error('通信错误:', chrome.runtime.lastError);
      showHint('请刷新页面后重试', true);
      return;
    }
    
    if (!response || !response.title) {
      showHint('未找到笔记标题', true);
      return;
    }

    extractedTitle = response.title;
    titleContent.textContent = extractedTitle;
    titleResult.classList.remove('hidden');
    showHint('', false);

    // 同步到导出数据
    if (!lastExportData) lastExportData = {};
    lastExportData.title = extractedTitle;
    lastExportData.analysisTime = new Date().toISOString();

  } catch (error) {
    console.error('提取标题失败:', error);
    showHint('提取标题失败', true);
  }
});

// 精华评论按钮点击事件
// 从前 20 条评论中筛选 3 条最有价值的（请求 21 条，第1条为正文跳过）
extractCommentsBtn.addEventListener('click', async () => {
  console.log('精华评论按钮被点击');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) {
      showHint('请刷新页面后重试', true);
      return;
    }
    
    // 请求21条，跳过第1条正文后得到20条评论
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: 'extractComments', limit: 21 }, resolve);
    });
    
    console.log('extractComments 响应:', response);
    
    if (chrome.runtime.lastError) {
      console.error('通信错误:', chrome.runtime.lastError);
      showHint('请刷新页面后重试', true);
      return;
    }
    
    if (!response || !response.comments || response.comments.length === 0) {
      showHint('未找到评论', true);
      return;
    }

    extractedComments = response.comments;
    console.log('提取到评论数量:', extractedComments.length);
    showHint('精华评论筛选中...', false);
    
    // 提取标题
    if (!extractedTitle) {
      const titleResponse = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: 'extractTitle' }, resolve);
      });
      if (titleResponse && titleResponse.title) {
        extractedTitle = titleResponse.title;
        titleContent.textContent = extractedTitle;
        titleResult.classList.remove('hidden');
      }
    }

    // 调用 API
    setLoading(true);
    commentsResult.classList.remove('hidden');
    commentsContent.innerHTML = '<p>正在调用 AI...</p>';

    const prompt = `请从以下${extractedComments.length}条小红书笔记评论中，筛选出信息量最丰富、最有价值的3条评论。

评论列表：
${extractedComments.map((c, i) => `${i + 1}. ${c}`).join('\n')}

请严格按以下JSON格式输出，不要输出其他内容：
{
  "comments": [
    {"content": "评论内容1", "value": "价值点说明，20字以内"},
    {"content": "评论内容2", "value": "价值点说明，20字以内"},
    {"content": "评论内容3", "value": "价值点说明，20字以内"}
  ]
}`;

    console.log('准备调用 API...');
    const commentResult = await callAPIForComments(prompt, commentsContent);
    console.log('API 调用完成');

    // 保存精华评论到导出数据
    if (!lastExportData) lastExportData = {};
    lastExportData.title = extractedTitle;
    lastExportData.analysisTime = new Date().toISOString();
    if (commentResult) lastExportData.comments = commentResult;
    updateExportButton();

    setLoading(false);
    showHint('精华评论提取完成 ✓', false);
    
  } catch (error) {
    console.error('精华评论失败:', error);
    showHint('操作失败: ' + error.message, true);
    setLoading(false);
  }
});

// 评论汇总按钮点击事件
startSummaryBtn.addEventListener('click', async () => {
  console.log('评论汇总按钮被点击');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) {
      showHint('请刷新页面后重试', true);
      return;
    }
    
    // 请求51条，跳过正文后得到50条
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: 'extractComments', limit: 51 }, resolve);
    });
    
    console.log('extractComments 响应:', response);
    
    if (!response || !response.comments || response.comments.length === 0) {
      showHint('未找到评论', true);
      return;
    }

    const allComments = response.comments;
    console.log('提取到评论数量:', allComments.length);
    showHint('评论汇总生成中...', false);
    
    // 提取标题
    if (!extractedTitle) {
      const titleResponse = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: 'extractTitle' }, resolve);
      });
      if (titleResponse && titleResponse.title) {
        extractedTitle = titleResponse.title;
        titleContent.textContent = extractedTitle;
        titleResult.classList.remove('hidden');
      }
    }

    // 调用 API
    setLoading(true);
    summaryResult.classList.remove('hidden');
    summaryContent.innerHTML = '<p>正在调用 AI...</p>';

    const prompt = `请根据以下小红书笔记的标题和评论，生成评论汇总分析。

笔记标题：${extractedTitle || '未知标题'}

笔记评论（共${allComments.length}条）：
${allComments.map((c, i) => `${i + 1}. ${c}`).join('\n')}

请按以下结构输出，使用 Markdown 格式：

## 🎯 核心话题
这篇笔记主要讨论什么，30字以内简要概括

## 💬 用户观点
评论区的主流观点和态度，可以用**加粗**强调重点

## 💡 有价值信息
评论中提到的有用信息、经验或建议，可以使用列表

## ⚡ 争议点
如果有不同意见简要说明，没有则写"评论观点较为一致，暂无明显争议"

请用简洁清晰的语言输出。`;

    console.log('准备调用 API...');
    await streamAPICall(prompt, summaryContent);
    console.log('API 调用完成');

    // 保存汇总文本到导出数据
    if (!lastExportData) lastExportData = {};
    lastExportData.title = extractedTitle;
    lastExportData.analysisTime = new Date().toISOString();
    lastExportData.summary = summaryContent.innerText || summaryContent.textContent || '';
    updateExportButton();

    setLoading(false);
    showHint('评论汇总完成 ✓', false);
    
  } catch (error) {
    console.error('生成汇总失败:', error);
    showHint('操作失败: ' + error.message, true);
    setLoading(false);
  }
});

// ============================================================
// 导出 Excel
// ============================================================
exportAllBtn.addEventListener('click', () => {
  if (!lastExportData) {
    showHint('暂无可导出的分析结果', true);
    return;
  }

  try {
    const rows = [];

    // 基础信息行
    rows.push(['笔记标题', lastExportData.title || '']);
    rows.push(['分析时间', lastExportData.analysisTime
      ? new Date(lastExportData.analysisTime).toLocaleString('zh-CN')
      : '']);
    rows.push([]); // 空行分隔

    // 精华评论
    if (lastExportData.comments && lastExportData.comments.length > 0) {
      rows.push(['精华评论', '评论内容', '价值点']);
      lastExportData.comments.forEach((c, i) => {
        rows.push([`精华评论 ${i + 1}`, c.content || '', c.value || '']);
      });
      rows.push([]); // 空行分隔
    }

    // 评论汇总
    if (lastExportData.summary) {
      rows.push(['评论汇总分析']);
      // 按行拆分，每行一个单元格
      lastExportData.summary.split('\n').forEach(line => {
        if (line.trim()) rows.push([line.trim()]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // 设置列宽
    ws['!cols'] = [
      { wch: 18 },
      { wch: 50 },
      { wch: 30 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '评论分析');

    // 文件名
    const dateStr = new Date().toISOString().slice(0, 10);
    const titlePart = (lastExportData.title || '笔记')
      .slice(0, 20)
      .replace(/[\\/:*?"<>|]/g, '');
    const fileName = `评论分析_${dateStr}_${titlePart}.xlsx`;

    // 生成并下载
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({ url, filename: fileName, saveAs: true }, (downloadId) => {
      if (chrome.runtime.lastError) {
        // 降级方案
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });

    showHint('Excel 已导出 ✓', false);
  } catch (error) {
    console.error('导出失败:', error);
    showHint('导出失败: ' + error.message, true);
  }
});

// 暂存当前结果按钮事件
saveCurrentBtn.addEventListener('click', saveCurrentResults);

// 查看已暂存按钮事件
viewSavedBtn.addEventListener('click', async () => {
  try {
    const { savedItems = [] } = await chrome.storage.local.get('savedItems');

    // 显示模态框
    document.getElementById('savedModal').classList.remove('hidden');

    // 渲染列表
    const filterComments = document.getElementById('filterComments').checked;
    const filterSummaries = document.getElementById('filterSummaries').checked;
    const filteredItems = savedItems.filter(item => {
      if (item.type === 'comment' && !filterComments) return false;
      if (item.type === 'summary' && !filterSummaries) return false;
      return true;
    });

    renderSavedList(filteredItems);
  } catch (error) {
    console.error('查看已暂存失败:', error);
    showHint('查看失败: ' + error.message, true);
  }
});

// 批量导出按钮事件
batchExportBtn.addEventListener('click', batchExportAll);

// 模态框控制
document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('savedModal').classList.add('hidden');
});

// 筛选复选框事件
document.getElementById('filterComments').addEventListener('change', async () => {
  await refreshSavedList();
});

document.getElementById('filterSummaries').addEventListener('change', async () => {
  await refreshSavedList();
});

// 全选按钮事件
document.getElementById('selectAllBtn').addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('.item-checkbox');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  checkboxes.forEach(cb => cb.checked = !allChecked);
  updateExportButtonState();
});

// 导出选中项按钮事件
document.getElementById('exportSelectedBtn').addEventListener('click', exportSelectedItems);

// 清空全部按钮事件
document.getElementById('clearAllBtn').addEventListener('click', async () => {
  if (!confirm('确定要清空所有暂存的数据吗？此操作不可恢复。')) return;

  try {
    await chrome.storage.local.set({ savedItems: [] });
    renderSavedList([]);
    updateSavedCount();
    showHint('已清空全部数据 ✓', false);
  } catch (error) {
    console.error('清空失败:', error);
    showHint('清空失败: ' + error.message, true);
  }
});

// 刷新已暂存列表
async function refreshSavedList() {
  try {
    const { savedItems = [] } = await chrome.storage.local.get('savedItems');
    const filterComments = document.getElementById('filterComments').checked;
    const filterSummaries = document.getElementById('filterSummaries').checked;
    const filteredItems = savedItems.filter(item => {
      if (item.type === 'comment' && !filterComments) return false;
      if (item.type === 'summary' && !filterSummaries) return false;
      return true;
    });

    renderSavedList(filteredItems);
  } catch (error) {
    console.error('刷新列表失败:', error);
  }
}

// 点击模态框背景关闭
document.getElementById('savedModal').addEventListener('click', (e) => {
  if (e.target.id === 'savedModal') {
    document.getElementById('savedModal').classList.add('hidden');
  }
});

// ============================================================
// 精华评论专用 API 调用（返回色块卡片，并返回结构化数据）
// ============================================================
async function callAPIForComments(userPrompt, targetElement) {
  console.log('=== 精华评论 API 调用开始 ===');
  
  if (!API_KEY || API_KEY === '在这里填入你的API_KEY') {
    targetElement.innerHTML = '<p style="color: #ff4757;">请配置 API Key</p>';
    return null;
  }

  try {
    targetElement.innerHTML = '<p>正在调用 AI，请稍候...</p>';
    
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个专业的内容分析助手。请严格按照用户要求的JSON格式输出，不要添加任何额外的文字说明。' },
          { role: 'user', content: userPrompt }
        ],
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API 错误:', errorText);
      targetElement.innerHTML = `<p style="color: #ff4757;">API 错误: ${response.status}</p>`;
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      console.log('AI 返回内容:', content);
      
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonData = JSON.parse(jsonMatch[0]);
          const comments = jsonData.comments || [];
          
          const colors = ['#fff5f5', '#f0f9ff', '#f0fdf4'];
          const borderColors = ['#ff4757', '#3b82f6', '#22c55e'];
          
          let html = '<div class="comment-cards">';
          comments.forEach((item, index) => {
            html += `
              <div class="comment-card" style="background: ${colors[index % 3]}; border-left: 4px solid ${borderColors[index % 3]};">
                <div class="comment-card-header">💎 精华评论 ${index + 1}</div>
                <div class="comment-card-content">${item.content}</div>
                <div class="comment-card-value">✨ ${item.value}</div>
              </div>
            `;
          });
          html += '</div>';
          
          targetElement.innerHTML = html;
          return comments; // 返回结构化数据用于导出
        } else {
          targetElement.innerHTML = content.replace(/\n/g, '<br>');
        }
      } catch (parseError) {
        console.error('JSON 解析错误:', parseError);
        targetElement.innerHTML = content.replace(/\n/g, '<br>');
      }
    } else {
      targetElement.innerHTML = '<p style="color: #ff4757;">AI 返回内容为空</p>';
    }
    return null;
    
  } catch (error) {
    console.error('API 调用失败:', error);
    targetElement.innerHTML = `<p style="color: #ff4757;">请求失败: ${error.message}</p>`;
    return null;
  }
}

// Markdown 渲染函数
function renderMarkdown(content) {
  console.log('开始渲染 Markdown，marked 库状态:', typeof marked);
  
  try {
    if (typeof marked !== 'undefined') {
      if (typeof marked.parse === 'function') {
        return marked.parse(content);
      } else if (typeof marked === 'function') {
        return marked(content);
      }
    }
  } catch (e) {
    console.error('marked 库渲染失败:', e);
  }
  
  // Fallback: 手动解析 Markdown
  let html = content;
  html = html.replace(/\n{3,}/g, '\n\n');
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^\*]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
  html = html.replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/<\/li>\n<li>/g, '</li><li>');
  html = html.replace(/<ul>\n/g, '<ul>');
  html = html.replace(/\n<\/ul>/g, '</ul>');
  html = html.replace(/<\/h([123])>\n+/g, '</h$1>');
  html = html.replace(/\n+<h([123])>/g, '<h$1>');
  html = html.replace(/\n\n+/g, '<br>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/(<br>){2,}/g, '<br>');
  html = html.replace(/<br>(<h[123]>)/g, '$1');
  html = html.replace(/(<\/h[123]>)<br>/g, '$1');
  html = html.replace(/<br>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<br>/g, '$1');
  
  return html;
}

// API 调用（非流式）
async function streamAPICall(userPrompt, targetElement) {
  console.log('=== API 调用开始 ===');
  
  if (!API_KEY || API_KEY === '在这里填入你的API_KEY') {
    targetElement.innerHTML = '<p style="color: #ff4757;">请配置 API Key</p>';
    return;
  }

  try {
    targetElement.innerHTML = '<p>正在调用 AI，请稍候...</p>';
    
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个专业的内容分析助手，擅长分析社交媒体内容和用户评论。请用中文回答。' },
          { role: 'user', content: userPrompt }
        ],
        stream: false
      })
    });

    console.log('API 响应状态:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API 错误:', errorText);
      targetElement.innerHTML = `<p style="color: #ff4757;">API 错误: ${response.status}</p>`;
      return;
    }

    const data = await response.json();
    console.log('API 返回数据:', data);
    
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      console.log('AI 返回内容:', content.substring(0, 100));
      targetElement.innerHTML = renderMarkdown(content);
      console.log('=== API 调用完成 ===');
    } else {
      targetElement.innerHTML = '<p style="color: #ff4757;">AI 返回内容为空</p>';
    }
    
  } catch (error) {
    console.error('API 调用失败:', error);
    targetElement.innerHTML = `<p style="color: #ff4757;">请求失败: ${error.message}</p>`;
  }
}

// ============================================================
// 数据持久化相关功能
// ============================================================

// 更新暂存数量显示
async function updateSavedCount() {
  try {
    const { savedItems = [] } = await chrome.storage.local.get('savedItems');
    savedCount.textContent = savedItems.length;
    batchExportBtn.disabled = savedItems.length === 0;
  } catch (error) {
    console.error('更新暂存数量失败:', error);
  }
}

// 暂存当前结果
async function saveCurrentResults() {
  if (!lastExportData) {
    showHint('暂无可暂存的数据', true);
    return;
  }

  try {
    const itemsToSave = [];
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const noteUrl = tab.url;

    // 如果有精华评论
    if (lastExportData.comments?.length > 0) {
      lastExportData.comments.forEach(comment => {
        itemsToSave.push({
          id: Date.now() + Math.random(),
          noteTitle: extractedTitle,
          noteUrl: noteUrl,
          type: 'comment',
          commentContent: comment.content,
          commentValue: comment.value,
          savedAt: new Date().toISOString()
        });
      });
    }

    // 如果有汇总分析
    if (lastExportData.summary) {
      itemsToSave.push({
        id: Date.now() + Math.random(),
        noteTitle: extractedTitle,
        noteUrl: noteUrl,
        type: 'summary',
        summaryContent: lastExportData.summary,
        savedAt: new Date().toISOString()
      });
    }

    // 保存到Chrome Storage
    const { savedItems = [] } = await chrome.storage.local.get('savedItems');
    const updatedItems = [...savedItems, ...itemsToSave];

    // 限制最大数量
    if (updatedItems.length > 100) {
      updatedItems.splice(0, updatedItems.length - 100);
    }

    await chrome.storage.local.set({ savedItems: updatedItems });

    updateSavedCount();
    showHint(`已暂存当前分析结果 ✓ (${itemsToSave.length} 项)`, false);

  } catch (error) {
    console.error('暂存失败:', error);
    showHint('暂存失败: ' + error.message, true);
  }
}

// 渲染暂存列表
function renderSavedList(items) {
  const listContainer = document.getElementById('savedList');

  if (items.length === 0) {
    listContainer.innerHTML = '<p class="empty-message">暂无暂存的数据</p>';
    return;
  }

  listContainer.innerHTML = items.map(item => `
    <div class="saved-item" data-id="${item.id}">
      <input type="checkbox" class="item-checkbox" data-id="${item.id}">
      <div class="item-content">
        <div class="item-title" title="${item.noteTitle}">${item.noteTitle}</div>
        <div class="item-type">${item.type === 'comment' ? '💎 精华评论' : '📊 汇总分析'}</div>
        <div class="item-preview">${getItemPreview(item)}</div>
        <div class="item-time">${formatTime(item.savedAt)}</div>
      </div>
      <button class="delete-item" data-id="${item.id}" title="删除">×</button>
    </div>
  `).join('');

  // 添加事件监听
  listContainer.querySelectorAll('.item-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateExportButtonState);
  });

  listContainer.querySelectorAll('.delete-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const itemId = parseFloat(btn.dataset.id);
      await deleteSavedItem(itemId);
    });
  });
}

// 获取项目预览文本
function getItemPreview(item) {
  if (item.type === 'comment') {
    return `${item.commentContent.substring(0, 100)}${item.commentContent.length > 100 ? '...' : ''}`;
  } else if (item.type === 'summary') {
    const lines = item.summaryContent.split('\n').filter(line => line.trim());
    return lines.slice(0, 2).join(' • ').substring(0, 100) + '...';
  }
  return '';
}

// 格式化时间
function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// 删除暂存项
async function deleteSavedItem(itemId) {
  try {
    const { savedItems = [] } = await chrome.storage.local.get('savedItems');
    const updatedItems = savedItems.filter(item => item.id !== itemId);
    await chrome.storage.local.set({ savedItems: updatedItems });

    // 重新渲染列表
    const filterComments = document.getElementById('filterComments').checked;
    const filterSummaries = document.getElementById('filterSummaries').checked;
    const filteredItems = updatedItems.filter(item => {
      if (item.type === 'comment' && !filterComments) return false;
      if (item.type === 'summary' && !filterSummaries) return false;
      return true;
    });

    renderSavedList(filteredItems);
    updateSavedCount();
    showHint('已删除 ✓', false);
  } catch (error) {
    console.error('删除失败:', error);
    showHint('删除失败: ' + error.message, true);
  }
}

// 更新导出按钮状态
function updateExportButtonState() {
  const selectedCount = document.querySelectorAll('.item-checkbox:checked').length;
  const exportSelectedBtn = document.getElementById('exportSelectedBtn');
  exportSelectedBtn.disabled = selectedCount === 0;
  exportSelectedBtn.textContent = `导出选中项 (${selectedCount})`;
}

// 导出选中的项目
async function exportSelectedItems() {
  const selectedIds = Array.from(document.querySelectorAll('.item-checkbox:checked'))
    .map(cb => parseFloat(cb.dataset.id));

  if (selectedIds.length === 0) return;

  try {
    const { savedItems = [] } = await chrome.storage.local.get('savedItems');
    const selectedItems = savedItems.filter(item => selectedIds.includes(item.id));

    // 按新格式生成Excel
    const rows = [
      ['笔记标题', '评论内容/汇总', '价值点', '类型', '保存时间', '笔记链接']
    ];

    selectedItems.forEach(item => {
      if (item.type === 'comment') {
        rows.push([
          item.noteTitle,
          item.commentContent,
          item.commentValue || '',
          '精华评论',
          formatTime(item.savedAt),
          item.noteUrl
        ]);
      } else if (item.type === 'summary') {
        // 将汇总内容按行拆分，每行作为一条记录
        const summaryLines = item.summaryContent.split('\n').filter(line => line.trim() && !line.startsWith('##'));
        if (summaryLines.length === 0) {
          rows.push([
            item.noteTitle,
            item.summaryContent,
            '',
            '汇总分析',
            formatTime(item.savedAt),
            item.noteUrl
          ]);
        } else {
          summaryLines.forEach(line => {
            rows.push([
              item.noteTitle,
              line.trim(),
              '',
              '汇总分析',
              formatTime(item.savedAt),
              item.noteUrl
            ]);
          });
        }
      }
    });

    generateExcelAndDownload(rows, '批量评论分析');
    showHint(`已导出 ${selectedIds.length} 项数据 ✓`, false);
  } catch (error) {
    console.error('导出失败:', error);
    showHint('导出失败: ' + error.message, true);
  }
}

// 批量导出所有数据
async function batchExportAll() {
  try {
    const { savedItems = [] } = await chrome.storage.local.get('savedItems');
    if (savedItems.length === 0) {
      showHint('暂无暂存的数据', true);
      return;
    }

    // 按新格式生成Excel
    const rows = [
      ['笔记标题', '评论内容/汇总', '价值点', '类型', '保存时间', '笔记链接']
    ];

    savedItems.forEach(item => {
      if (item.type === 'comment') {
        rows.push([
          item.noteTitle,
          item.commentContent,
          item.commentValue || '',
          '精华评论',
          formatTime(item.savedAt),
          item.noteUrl
        ]);
      } else if (item.type === 'summary') {
        const summaryLines = item.summaryContent.split('\n').filter(line => line.trim() && !line.startsWith('##'));
        if (summaryLines.length === 0) {
          rows.push([
            item.noteTitle,
            item.summaryContent,
            '',
            '汇总分析',
            formatTime(item.savedAt),
            item.noteUrl
          ]);
        } else {
          summaryLines.forEach(line => {
            rows.push([
              item.noteTitle,
              line.trim(),
              '',
              '汇总分析',
              formatTime(item.savedAt),
              item.noteUrl
            ]);
          });
        }
      }
    });

    generateExcelAndDownload(rows, '批量评论分析_全部');
    showHint(`已导出全部 ${savedItems.length} 项数据 ✓`, false);
  } catch (error) {
    console.error('批量导出失败:', error);
    showHint('批量导出失败: ' + error.message, true);
  }
}

// 通用的Excel生成和下载函数
function generateExcelAndDownload(rows, baseFileName) {
  try {
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // 设置列宽
    ws['!cols'] = [
      { wch: 25 },  // 笔记标题
      { wch: 60 },  // 评论内容/汇总
      { wch: 20 },  // 价值点
      { wch: 12 },  // 类型
      { wch: 20 },  // 保存时间
      { wch: 40 }   // 笔记链接
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '评论分析');

    // 文件名
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `${baseFileName}_${dateStr}.xlsx`;

    // 生成并下载
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({ url, filename: fileName, saveAs: true }, (downloadId) => {
      if (chrome.runtime.lastError) {
        // 降级方案
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  } catch (error) {
    console.error('生成Excel失败:', error);
    throw error;
  }
}
