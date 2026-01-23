// Content Script - 用于提取小红书页面内容

console.log('小红书评论洞察助手 - Content Script 已加载');

// 标题选择器
const TITLE_SELECTORS = [
  '#detail-title',
  '[class*="title"]',
  '.note-title',
  'h1'
];

// 评论选择器 - 小红书评论区的各种可能结构
const COMMENT_SELECTORS = [
  // 小红书评论内容的常见 class
  '.note-text',
  '.comment-content',
  '[class*="commentContent"]',
  '[class*="comment-content"]',
  '[class*="content"][class*="comment"]',
  // 评论列表项中的文本
  '[class*="comment"] p',
  '[class*="comment"] span[class*="content"]',
  '[class*="comments"] [class*="content"]',
  // 更通用的选择器
  '[class*="CommentItem"] [class*="content"]',
  '[class*="commentItem"] [class*="content"]'
];

// 查找标题元素
function findTitleElement() {
  for (const selector of TITLE_SELECTORS) {
    try {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim().length > 2) {
        console.log('找到标题元素，选择器:', selector, '内容:', element.textContent.trim().substring(0, 50));
        return element;
      }
    } catch (e) {
      console.log('选择器错误:', selector, e);
    }
  }
  return null;
}

// 查找评论元素 - 改进版（排除正文）
function findCommentElements() {
  console.log('开始查找评论元素...');
  
  // 方法1: 先找到评论区容器，再在其中查找 .note-text
  // 小红书的评论区通常在 comments-container 或类似的容器中
  const commentContainerSelectors = [
    '[class*="comments-container"]',
    '[class*="commentsContainer"]',
    '[class*="comment-list"]',
    '[class*="commentList"]',
    '[class*="comments-el"]',
    '.comments-el',
    '#noteContainer [class*="comment"]'
  ];
  
  for (const containerSelector of commentContainerSelectors) {
    try {
      const container = document.querySelector(containerSelector);
      if (container) {
        console.log('找到评论区容器:', containerSelector);
        
        // 在评论区容器内查找 .note-text
        const noteTextElements = container.querySelectorAll('.note-text');
        if (noteTextElements.length > 0) {
          console.log('方法1 - 在评论区内找到 .note-text 数量:', noteTextElements.length);
          return Array.from(noteTextElements);
        }
        
        // 如果没有 .note-text，尝试查找评论内容的其他选择器
        const commentContentElements = container.querySelectorAll('[class*="content"]:not([class*="container"])');
        const validElements = Array.from(commentContentElements).filter(el => {
          const text = el.textContent.trim();
          return text.length > 2 && text.length < 500;
        });
        
        if (validElements.length > 0) {
          console.log('方法1 - 在评论区内找到内容元素数量:', validElements.length);
          return validElements;
        }
      }
    } catch (e) {
      console.log('容器选择器错误:', containerSelector, e);
    }
  }
  
  // 方法2: 查找 parent-comment 下的 .note-text（排除正文区域的 .note-text）
  console.log('方法1未找到容器，尝试方法2...');
  const parentComments = document.querySelectorAll('[class*="parent-comment"], [class*="parentComment"], [class*="comment-item"], [class*="commentItem"]');
  
  if (parentComments.length > 0) {
    console.log('找到评论项数量:', parentComments.length);
    const commentTexts = [];
    
    parentComments.forEach(comment => {
      // 在每个评论项中查找文本内容
      const noteText = comment.querySelector('.note-text');
      if (noteText) {
        commentTexts.push(noteText);
      } else {
        // 尝试其他内容选择器
        const contentEl = comment.querySelector('[class*="content"]:not([class*="container"])');
        if (contentEl && contentEl.textContent.trim().length > 2) {
          commentTexts.push(contentEl);
        }
      }
    });
    
    if (commentTexts.length > 0) {
      console.log('方法2 - 从评论项中提取到评论数量:', commentTexts.length);
      return commentTexts;
    }
  }
  
  // 方法3: 直接查找 .note-text 但排除正文区域
  console.log('方法2未找到，尝试方法3...');
  const allNoteTexts = document.querySelectorAll('.note-text');
  
  if (allNoteTexts.length > 1) {
    // 假设第一个是正文，后面的是评论
    const commentNoteTexts = Array.from(allNoteTexts).slice(1);
    console.log('方法3 - 排除第一个后的 .note-text 数量:', commentNoteTexts.length);
    return commentNoteTexts;
  }
  
  // 方法4: 兜底 - 遍历评论区域
  console.log('方法3未找到足够元素，尝试方法4...');
  const commentSection = document.querySelector('[class*="comment"]');
  
  if (commentSection) {
    const allTextElements = commentSection.querySelectorAll('span, p');
    const validComments = [];
    const seenTexts = new Set();
    
    for (const el of allTextElements) {
      const text = el.textContent.trim();
      if (text.length >= 5 && 
          text.length < 500 && 
          el.children.length === 0 &&
          !seenTexts.has(text) &&
          !text.match(/^\d+$/) &&
          !text.match(/^[\d\-:]+$/) &&
          !text.includes('条评论') &&
          !text.includes('回复') &&
          text !== '赞') {
        seenTexts.add(text);
        validComments.push({ textContent: text });
      }
    }
    
    if (validComments.length > 0) {
      console.log('方法4 - 找到评论数量:', validComments.length);
      return validComments;
    }
  }
  
  return [];
}

// 监听来自 sidepanel 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request.action);
  
  // 用于检测 content script 是否已注入
  if (request.action === 'ping') {
    sendResponse({ status: 'ok' });
    return true;
  }
  
  if (request.action === 'checkElements') {
    const titleElement = findTitleElement();
    const commentElements = findCommentElements();
    
    const result = {
      hasTitle: !!titleElement,
      hasComments: commentElements.length > 0
    };
    
    console.log('checkElements 结果:', result);
    sendResponse(result);
  }
  
  else if (request.action === 'extractTitle') {
    const titleElement = findTitleElement();
    
    if (titleElement) {
      const title = titleElement.textContent || titleElement.innerText;
      console.log('提取到标题:', title.trim());
      sendResponse({ title: title.trim() });
    } else {
      console.log('未找到标题元素');
      sendResponse({ title: null });
    }
  }
  
  else if (request.action === 'extractComments') {
    const limit = request.limit || 10;
    const commentElements = findCommentElements();
    const comments = [];
    
    console.log('extractComments - 找到元素数量:', commentElements.length);
    
    for (let i = 0; i < Math.min(commentElements.length, limit); i++) {
      const element = commentElements[i];
      const text = typeof element === 'string' ? element : (element.textContent || element.innerText);
      if (text && text.trim()) {
        comments.push(text.trim());
        console.log(`评论 ${i + 1}:`, text.trim().substring(0, 50));
      }
    }
    
    console.log('提取到评论数量:', comments.length);
    sendResponse({ comments: comments });
  }
  
  // 返回 true 表示异步响应
  return true;
});

// 调试：页面加载后打印所有包含 comment 的 class
setTimeout(() => {
  console.log('=== 调试：查找评论相关元素 ===');
  const elements = document.querySelectorAll('[class*="comment"], [class*="Comment"]');
  elements.forEach((el, i) => {
    if (i < 10) {
      console.log(`元素 ${i}:`, el.className, '内容:', el.textContent.substring(0, 100));
    }
  });
  console.log('=== 调试结束 ===');
}, 3000);

console.log('Content Script 初始化完成，URL:', window.location.href);
