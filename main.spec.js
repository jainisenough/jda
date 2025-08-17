import { open as fsOpen } from "node:fs/promises";
import { By } from "selenium-webdriver";
import { limitFunction } from "p-limit";
import edge from "selenium-webdriver/edge.js";
import {
  textIsNotEmpty,
  getChildAnchorIndex,
  parseData,
  parseCurrencyData,
  addOptions,
  logger,
  addCalculatedValues,
  getTotalPlotLinks,
} from "./util.js";
import config from "./config.json" with {type: "json"};

const headerMap = {
  no: "No",
  schemeName: "Scheme Name",
  plotNo: "Plot No",
  plotDeveloperType: "Developer Type",
  plotDeveloperName: "Developer Name",
  plotArea: "Area (in sq. meter)",
  plotAreaYard: "Area (in sq. yard)",
  plotUsageType: "Usage Type",
  plotType: "Plot Type",
  bidStartPrice: "Bid Start Price",
  bidIncrement: "Minimum Increment",
  reservePrice: "Reserve Price",
  emdAmount: "EMD Amount",
  totalAmount: "Total Amount",
  corner: "Corner",
  commercial: "Commercial",
  emdDepositStartDate: "EMD Deposit Start Date",
  emdDepositEndDate: "EMD Deposit End Date",
  auctionStartDate: "Auction Start Date",
  auctionEndDate: "Auction End Date",
  location: "Map Location",
  auctionLink: "Auction Link",
  priority: "Priority",
};

const headerMapKeys = Object.keys(headerMap);
const responseIndexToParse = [4, 7, 8, 9, 10];
const responseStringIndexToParse = [0, 1, 2, 3, 15, 16];
const parseCurrencyIndex = [9, 10, 11, 12];
const idxToCalc = [0, 6, 13, 14, 15, 21, 22];

const propertyDetailValues = {
  [headerMapKeys[1]]: [1, 3],
  [headerMapKeys[2]]: [2, 6],
  [headerMapKeys[3]]: [3, 6],
  [headerMapKeys[4]]: [4, 3],
  [headerMapKeys[5]]: [4, 6],
  [headerMapKeys[7]]: [5, 3],
  [headerMapKeys[8]]: [5, 6],
};

const bidDetailValues = {
  [headerMapKeys[9]]: [2, 3],
  [headerMapKeys[10]]: [2, 6],
  [headerMapKeys[11]]: [3, 3],
  [headerMapKeys[16]]: [4, 3],
  [headerMapKeys[17]]: [5, 3],
  [headerMapKeys[18]]: [4, 6],
  [headerMapKeys[19]]: [5, 6],
  [headerMapKeys[20]]: [8, 3],
};

const emdDetailValues = {
  [headerMapKeys[12]]: [1, 4],
};

const auctionDetailValues = {
  title: [1, 3],
};

const addCalc = addCalculatedValues(idxToCalc);

(async function mainTest() {
  const options = new edge.Options();
  addOptions(options);
  let driver;

  try {
    const service = new edge.ServiceBuilder(config.driverPath).build();
    driver = edge.Driver.createSession(options, service);

    await driver.get("http://udhonline.rajasthan.gov.in/Portal/AuctionListNew");
    const jdaRowElement = await driver.findElement(
      By.xpath("//td[text()='Jaipur Development Authority']")
    );
    const jdaRowCount = await jdaRowElement.findElement(
      By.xpath("following-sibling::*[1]")
    );
    const jdaRowChild = await jdaRowCount.findElement(
      By.xpath("./child::a[1]")
    );

    const [jdaRowLink, jdaPlotsCount] = await Promise.all([
      jdaRowChild.getAttribute("href"),
      jdaRowChild.getText(),
    ]);
    logger.log("Step 1 completed");

    // redirect to link
    await driver.get(jdaRowLink);
    const tableElement = await driver.findElement(By.css("table"));
    const tbodyElement = await tableElement.findElement(
      By.xpath("./child::tbody[1]")
    );

    // retreive scheme links
    const schemesElement = await tbodyElement.findElements(
      By.xpath("./child::*")
    );
    schemesElement.splice(-1, 1);
    const schemeLinks = await Promise.all(
      schemesElement.map(
        limitFunction(
          async (schEle) => {
            const schemaRowChild = await schEle.findElement(
              By.xpath("./child::td[3]")
            );
            const schemeRowLink = await schemaRowChild.findElement(
              By.xpath("./child::a[1]")
            );
            return await schemeRowLink.getAttribute("href");
          },
          { concurrency: config.concurrency }
        )
      )
    );
    logger.log("Step 2 completed");

    const filehandle = await fsOpen("plots.csv", "w+");
    await filehandle.write(`${Object.values(headerMap).join(",")}\n`);
    const allPlotLinks = [];
    for (let link of schemeLinks) {
      await driver.get(link);
      const locationLink = await getTotalPlotLinks(driver);
      allPlotLinks.push(...locationLink);
    }
    logger.log("Step 3 completed");

    for (let link of allPlotLinks) {
      await driver.get(link);

      // get property details
      const [
        auctionDetailsTableBody,
        propertyDetailsTableBody,
        bidDetailsTableBody,
        emdDetailsTableBody,
      ] = await Promise.all(
        [
          "Auction Details",
          "Property Details",
          "Bid/Auction Details",
          "Fee and EMD Details",
        ].map(async (heading) => {
          const headingElement = await driver.findElement(
            By.xpath(`//h4[contains(text(), '${heading}')]/parent::div`)
          );
          const tableElement = await headingElement.findElement(
            By.xpath("following-sibling::*[1]")
          );
          return await tableElement.findElement(By.xpath(".//tbody"));
        })
      );

      const propertyData = await Promise.all([
        ...headerMapKeys
          .slice(0, 1)
          .map(() =>
            auctionDetailsTableBody.findElement(
              By.xpath(
                `./child::tr[${auctionDetailValues.title[0]}]/child::td[${auctionDetailValues.title[1]}]`
              )
            )
          ),
        ...[...headerMapKeys.slice(1, 6), ...headerMapKeys.slice(7, 9)].map(
          (key) =>
            propertyDetailsTableBody.findElement(
              By.xpath(
                `./child::tr[${propertyDetailValues[key][0]}]/child::td[${propertyDetailValues[key][1]}]`
              )
            )
        ),
        ...headerMapKeys
          .slice(9, 12)
          .map((key) =>
            bidDetailsTableBody.findElement(
              By.xpath(
                `./child::tr[${bidDetailValues[key][0]}]/child::td[${bidDetailValues[key][1]}]`
              )
            )
          ),
        ...headerMapKeys
          .slice(12, 13)
          .map((key) =>
            emdDetailsTableBody.findElement(
              By.xpath(
                `./child::tr[${emdDetailValues[key][0]}]/child::td[${emdDetailValues[key][1]}]`
              )
            )
          ),
        ...headerMapKeys
          .slice(16, 21)
          .map((key) =>
            bidDetailsTableBody.findElement(
              By.xpath(
                `./child::tr[${bidDetailValues[key][0]}]/child::td[${bidDetailValues[key][1]}]`
              )
            )
          ),
      ]);

      // TODO: add retry mechanism for thrice
      await driver.wait(textIsNotEmpty(propertyData[0]), 60 * 1000);
      const [title, ...resp] = await Promise.all(
        propertyData.map(async (locator) => {
          const childAnchor = await getChildAnchorIndex(locator);
          if (childAnchor) {
            const locationUrl = await childAnchor.getAttribute("href");
            return locationUrl;
          } else {
            return await locator.getText();
          }
        })
      );

      let data = parseData(
        resp,
        responseIndexToParse,
        responseStringIndexToParse
      );
      addCalc({ data, link, title });
      data = parseCurrencyData(data, parseCurrencyIndex);
      let strData = `${data.join(",")}`;
      if (data[0] !== jdaPlotsCount) {
        strData += "\n";
      }
      await filehandle.write(strData);
      logger.log(`${data[0]} record added`);
    }
    await filehandle.close();
  } catch (e) {
    console.log(e);
  } finally {
    await driver.quit();
  }
})();
