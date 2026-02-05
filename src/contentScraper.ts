chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrape") {
    
    const pageText = document.body.innerText;
    sendResponse({status: "success", data: pageText});
  } else { // not sure about how necessary this is since if it cant scrape itll just not work in a really obvious way.
    // TODO: change this handling s.t. it'll try again
    sendResponse({status: "failed scraping (1)", data: null})
  }
});
