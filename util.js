import { By, Condition } from "selenium-webdriver";
import config from "./config.json" with {type: "json"};

const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const parseNum = (str) => parseFloat(str.replace(/,/g, ""));

export const textIsNotEmpty = (locator) =>
  new Condition("for element to have non-empty text", async () => {
    const name = await locator.getText();
    return name.trim().length > 0;
  });

export const getChildAnchorIndex = async (locator) => {
  let childAnchorIndex = -1;
  const locatorChildren = await locator.findElements(By.xpath("./*"));
  if (locatorChildren.length) {
    const childTags = await Promise.all(
      locatorChildren.map((child) => child.getTagName())
    );
    childAnchorIndex = childTags.findIndex((tag) => tag === "a");
  }
  return childAnchorIndex > -1 ? locatorChildren[childAnchorIndex] : null;
};

export const parseData = (
  resp,
  responseIndexToParse,
  responseStringIndexToParse
) =>
  resp.map((val, idx) =>
    responseIndexToParse.includes(idx)
      ? parseNum(val)
      : responseStringIndexToParse.includes(idx)
      ? `"${val}"`
      : val
  );

const parseCurrency = (amt) => {
  let amount = parseFloat(amt.toFixed(2));
  amount = formatter.format(amount);
  return `"${amount}"`;
};

export const parseCurrencyData = (data, parseCurrencyIndex) => {
  return data.map((val, idx) =>
    parseCurrencyIndex.includes(idx) ? parseCurrency(val) : val
  );
};

export const addOptions = (options) => {
  if (config.private) {
    options.addArguments("--inprivate");
  }
  if (config.headless) {
    options.addArguments("--headless=new");
  }
};

export const logger = config.logging
  ? {
      log: console.log.bind(console),
    }
  : {
      log: () => {},
    };

export const addCalculatedValues = (idxToCalc) => {
  let i = 1;
  return ({ data, link, title }) => {
    idxToCalc.forEach((idx) => {
      let val = "";
      switch (idx) {
        case 0:
          val = i++;
          break;
        case 6:
          val = data[5] * 1.196;
          break;
        case 13:
          val = parseCurrency(data[5] * data[9]);
          break;
        case 14:
          val = title.toLowerCase().includes("(corner)");
          break;
        case 15:
          val = title.toLowerCase().includes("commercial");
          break;
        case 21:
          val = link;
          break;
        case 22:
          val = "Normal";
          break;
      }
      data.splice(idx, 0, val);
    });
  };
};

const readPLotLinks = async(driver) => {
  const tableElement = await driver.findElement(By.css("table"));
    const tbodyElement = await tableElement.findElement(
      By.xpath("./child::tbody[1]")
    );

    // retreive plot links
    const plotsElement = await tbodyElement.findElements(
      By.xpath("./child::*")
    );

    return await Promise.all(
      plotsElement
        .filter((_, idx) => idx % 2 === 0)
        .map(async (plotEle) => {
          const plotRowChild = await plotEle.findElement(
            By.xpath("./child::td[6]")
          );
          const plotRowLink = await plotRowChild.findElement(By.xpath(".//a"));
          return await plotRowLink.getAttribute("href");
        })
    );
}

export const getTotalPlotLinks = async (driver) => {
  const paginationList = await driver.findElement(By.className("pagination"));
  const paginationChild = await paginationList.findElements(
    By.xpath("./child::li")
  );

  // For page 1
  const plotLinks = await readPLotLinks(driver);

  for (let i = 2; i < paginationChild.length; i++) {
    const paginationNextBtn = await paginationChild[paginationChild.length - 1];
    const paginationNextBtnAnchor = await paginationNextBtn.findElement(
      By.xpath("./child::a[1]")
    );
    const nextBtnLink = await paginationNextBtnAnchor.getAttribute("href");
    await driver.get(nextBtnLink);
    const locationLink = await readPLotLinks(driver);
    plotLinks.push(...locationLink);
  }
  return plotLinks;
};
