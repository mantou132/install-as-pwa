const themeColorEle = document.querySelector('meta[name=theme-color]') as HTMLMetaElement;
const descriptionEle = document.querySelector('meta[name=description]') as HTMLMetaElement;

const result = {
  title: document.title,
  themeColor: themeColorEle?.content || '#20272b',
  backgroundColor: '#20272b',
  description: descriptionEle?.content || document.title,
  shortTitle: document.title.length > 10 ? location.host.match(/(?:.*\.)?([^.]*)\.\w*$/)?.[1] : document.title,
};

window.pageInfo = result;

export type Result = typeof result;

declare global {
  interface Window {
    pageInfo: Result;
  }
}
