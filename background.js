// Background Service Worker

// 点击插件图标时打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// 设置侧边栏行为 - 点击图标时打开
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('设置侧边栏行为失败:', error));

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'pageLoaded' || request.action === 'urlChanged') {
    // 页面加载或 URL 变化时，可以在这里做一些处理
    console.log('页面状态变化:', request.url);
  }
  return true;
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('xiaohongshu.com')) {
    // 小红书页面加载完成
    console.log('小红书页面加载完成:', tab.url);
  }
});
