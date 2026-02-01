chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrape") {
    
    const pageText = document.body.innerText;
    sendResponse({status: "success", data: pageText}); // return if complete
  } else {
    sendResponse({status: "failed scraping (1)", data: null})
  }
});