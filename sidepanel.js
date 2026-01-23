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

// 存储提取的数据
let extractedTitle = '';
let extractedComments = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('侧边栏初始化...');
  checkPageStatus();
});

// 确保 content script 已注入
async function ensureContentScriptInjected(tabId) {
  try {
    // 先尝试发送测试消息
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          console.log('Content script 未注入，正在注入...');
          // 注入 content script
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          }).then(() => {
            console.log('Content script 注入成功');
            // 等待一小段时间让脚本初始化
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

// 提取标题按钮点击事件
extractTitleBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 确保 content script 已注入
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
  } catch (error) {
    console.error('提取标题失败:', error);
    showHint('提取标题失败', true);
  }
});

// 精华评论按钮点击事件
extractCommentsBtn.addEventListener('click', async () => {
  console.log('精华评论按钮被点击');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 确保 content script 已注入
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) {
      showHint('请刷新页面后重试', true);
      return;
    }
    
    // 使用 Promise 包装 sendMessage（请求11条，跳过正文后得到10条）
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: 'extractComments', limit: 11 }, resolve);
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
    await callAPIForComments(prompt, commentsContent);
    console.log('API 调用完成');
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
    
    // 确保 content script 已注入
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) {
      showHint('请刷新页面后重试', true);
      return;
    }
    
    // 使用 Promise 包装 sendMessage（请求51条，跳过正文后得到50条）
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
    setLoading(false);
    showHint('评论汇总完成 ✓', false);
    
  } catch (error) {
    console.error('生成汇总失败:', error);
    showHint('操作失败: ' + error.message, true);
    setLoading(false);
  }
});

// 精华评论专用 API 调用（返回色块卡片）
async function callAPIForComments(userPrompt, targetElement) {
  console.log('=== 精华评论 API 调用开始 ===');
  
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
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      console.log('AI 返回内容:', content);
      
      try {
        // 尝试提取 JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonData = JSON.parse(jsonMatch[0]);
          const comments = jsonData.comments || [];
          
          // 渲染成色块卡片
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
        } else {
          // 如果没有找到 JSON，回退到普通显示
          targetElement.innerHTML = content.replace(/\n/g, '<br>');
        }
      } catch (parseError) {
        console.error('JSON 解析错误:', parseError);
        targetElement.innerHTML = content.replace(/\n/g, '<br>');
      }
    } else {
      targetElement.innerHTML = '<p style="color: #ff4757;">AI 返回内容为空</p>';
    }
    
  } catch (error) {
    console.error('API 调用失败:', error);
    targetElement.innerHTML = `<p style="color: #ff4757;">请求失败: ${error.message}</p>`;
  }
}

// 评论汇总专用 API 调用（返回色块卡片）
async function callAPIForSummary(userPrompt, targetElement) {
  console.log('=== 评论汇总 API 调用开始 ===');
  
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
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      console.log('AI 返回内容:', content);
      
      try {
        // 尝试提取 JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonData = JSON.parse(jsonMatch[0]);
          const sections = jsonData.sections || [];
          
          // 渲染成色块卡片
          const colors = ['#fff5f5', '#f0f9ff', '#f0fdf4', '#fefce8'];
          const borderColors = ['#ff4757', '#3b82f6', '#22c55e', '#f59e0b'];
          
          let html = '<div class="summary-cards">';
          sections.forEach((item, index) => {
            // 解析 Markdown 内容
            let parsedContent = item.content;
            try {
              if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
                parsedContent = marked.parse(item.content);
              } else if (typeof marked === 'function') {
                parsedContent = marked(item.content);
              } else {
                parsedContent = item.content
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\n/g, '<br>');
              }
            } catch (e) {
              parsedContent = item.content.replace(/\n/g, '<br>');
            }
            
            html += `
              <div class="summary-card" style="background: ${colors[index % 4]}; border-left: 4px solid ${borderColors[index % 4]};">
                <div class="summary-card-header">${item.icon || '📌'} ${item.title}</div>
                <div class="summary-card-content">${parsedContent}</div>
              </div>
            `;
          });
          html += '</div>';
          
          targetElement.innerHTML = html;
        } else {
          // 如果没有找到 JSON，回退到普通 Markdown 渲染
          try {
            if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
              targetElement.innerHTML = marked.parse(content);
            } else {
              targetElement.innerHTML = content.replace(/\n/g, '<br>');
            }
          } catch (e) {
            targetElement.innerHTML = content.replace(/\n/g, '<br>');
          }
        }
      } catch (parseError) {
        console.error('JSON 解析错误:', parseError);
        targetElement.innerHTML = content.replace(/\n/g, '<br>');
      }
    } else {
      targetElement.innerHTML = '<p style="color: #ff4757;">AI 返回内容为空</p>';
    }
    
  } catch (error) {
    console.error('API 调用失败:', error);
    targetElement.innerHTML = `<p style="color: #ff4757;">请求失败: ${error.message}</p>`;
  }
}

// Markdown 渲染函数
function renderMarkdown(content) {
  console.log('开始渲染 Markdown，marked 库状态:', typeof marked);
  
  // 尝试使用 marked 库
  try {
    if (typeof marked !== 'undefined') {
      if (typeof marked.parse === 'function') {
        console.log('使用 marked.parse()');
        return marked.parse(content);
      } else if (typeof marked === 'function') {
        console.log('使用 marked()');
        return marked(content);
      }
    }
  } catch (e) {
    console.error('marked 库渲染失败:', e);
  }
  
  // Fallback: 手动解析 Markdown
  console.log('使用手动 Markdown 解析');
  let html = content;
  
  // 清理多余的空行
  html = html.replace(/\n{3,}/g, '\n\n');
  
  // 处理标题 ## -> <h2>
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  
  // 处理加粗 **text** -> <strong>
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // 处理斜体 *text* -> <em>（避免与加粗冲突）
  html = html.replace(/(?<!\*)\*([^\*]+)\*(?!\*)/g, '<em>$1</em>');
  
  // 处理无序列表 - item -> <li>
  html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
  
  // 处理有序列表 1. item -> <li>
  html = html.replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');
  
  // 包装连续的 <li> 为 <ul>
  html = html.replace(/(<li>.*?<\/li>\n?)+/g, '<ul>$&</ul>');
  
  // 清理 <ul> 内的换行
  html = html.replace(/<\/li>\n<li>/g, '</li><li>');
  html = html.replace(/<ul>\n/g, '<ul>');
  html = html.replace(/\n<\/ul>/g, '</ul>');
  
  // 处理标题后的换行
  html = html.replace(/<\/h([123])>\n+/g, '</h$1>');
  html = html.replace(/\n+<h([123])>/g, '<h$1>');
  
  // 处理剩余的换行为 <br>，但避免连续多个
  html = html.replace(/\n\n+/g, '<br>');
  html = html.replace(/\n/g, '<br>');
  
  // 清理多余的 <br>
  html = html.replace(/(<br>){2,}/g, '<br>');
  html = html.replace(/<br>(<h[123]>)/g, '$1');
  html = html.replace(/(<\/h[123]>)<br>/g, '$1');
  html = html.replace(/<br>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<br>/g, '$1');
  
  return html;
}

// API 调用（非流式，更稳定）
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
        stream: false  // 使用非流式模式
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
      
      // 渲染 Markdown 内容
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
