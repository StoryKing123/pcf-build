#!/usr/bin/env node
import { Command } from "commander";
import {
  mkdirSync,
  ensureDirSync,
  ensureFileSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "fs-extra";
import spawn from "cross-spawn";
import { spawnSync } from "child_process";
import xml2js, { parseString, parseStringPromise } from "xml2js";
import path from "path";

const program = new Command();
const shell = require("shelljs");

const initSolution = (prefix: string, name: string) => {
  const pacSolutionInit = shell.exec(
    "pac solution init --publisher-name PCF --publisher-prefix PCF",
    //   "dir"
    { cwd: path.resolve(process.cwd(), "./solution") }
  );

  console.log("add-reference ");
  if (pacSolutionInit.code !== 0) {
    console.error("error");
  }
  shell.exec("pac solution add-reference --path ..\\ ", {
    cwd: path.resolve(process.cwd(), "./solution"),
  });
};

program
  // .description('命令描述') // 命令描述
  .option("-d, --dir <dirname>", "带参选项描述", "选项默认值"); // 带参选项（选项全称 取值时转成驼峰写法），支持设置默认值

program
  .command("is")
  .version("0.0.1")
  .description("子命令描述") // 命令描述
  .option("-pn,<publisherName>", "publisherName") // 参数，必填
  .option("-pp,<publisherPrefix>", "publisherPrefix") // 参数，必填
  /*
          argument 与 option 共存时：参数1为argument，参数2为option；否则参数1是argument或option
          添加多个argument时，依次为action的参数1、参数2、参数3
      */
  .action(async (option, options) => {
    const publisherPrefix = option.Pp;
    const publisherName = option.Pn;

    const publisher = `${publisherPrefix}_${publisherName}`;
    const project = "PCF";

    const projects = readdirSync(path.resolve(process.cwd(), "./out/controls"));
    console.log(projects);
    // return;
    // shell;
    const wholeName = `${publisher}.${project}`;
    console.log("start");
    ensureDirSync("solution");
    // const child = spawn(
    //   "pac",
    //   //   [`solution init --publisher-name PCF --publisher-prefix PCF`],
    //   //   "pac solution init --publisher-name PCF --publisher-prefix PCF",
    //   ["init", "--publisher-name", "PCF", "--publisher-prefix", "PCF"],
    //   { stdio: "inherit", cwd: path.resolve(process.cwd(), "./solution") }
    // );
    initSolution(publisherPrefix, publisherName);

    console.log("create file");

    const relationshipFile = path.resolve(
      process.cwd(),
      "./solution/package/[Content_Types].xml"
    );
    ensureFileSync(path.resolve(relationshipFile));

    writeFileSync(
      relationshipFile,
      `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml" /><Default Extension="js" ContentType="application/octet-stream" /><Override PartName="/Controls/${wholeName}/ControlManifest.xml" ContentType="application/octet-stream" /></Types>`
    );

    // ensureDirSync(
    //   path.resolve(process.cwd(), `./solution/package/Controls/${wholeName}`)
    // );
    console.log("copy build output");

    projects.forEach((project) => {
      const wholeName = `${publisher}.${project}`;
      ensureDirSync(
        path.resolve(process.cwd(), `./solution/package/Controls/${wholeName}`)
      );
      shell.cp(
        "-R",
        path.resolve(process.cwd(), `./out/controls/${project}`),
        path.resolve(process.cwd(), `./solution/package/Controls/${wholeName}`)
      );
    });

    shell.cp(
      "-R",
      path.resolve(process.cwd(), "./solution/src/Other/*"),
      path.resolve("./solution/package")
    );

    //modify solution xml

    const solutionPath = path.resolve(
      process.cwd(),
      "./solution/package/solution.xml"
    );
    let data = readFileSync(solutionPath, { encoding: "utf-8", flag: "r" });
    // console.log(data);
    const xml = await parseStringPromise(data);
    console.log("show xml");

    // console.log(xml.ImportExportXml.SolutionManifest[0].RootComponents);

    xml.ImportExportXml.SolutionManifest[0].RootComponents = {
      $: {
        type: 66,
        schemaName: wholeName,
        behavior: "0",
      },
    };

    const builder = new xml2js.Builder();
    const modifiedXmlString = builder.buildObject(xml);
    writeFileSync(solutionPath, modifiedXmlString);
    // console.log(modifiedXmlString);

    const customizationsPath = path.resolve(
      process.cwd(),
      "./solution/package/Customizations.xml"
    );
    const customizationsXmlString = readFileSync(customizationsPath, {
      encoding: "utf-8",
      flag: "r",
    });
    const customizationsXml = await parseStringPromise(customizationsXmlString);
    customizationsXml.ImportExportXml.CustomControls = [
      {
        CustomControl: {
          Name: wholeName,
          FileName: `/Controls/${wholeName}/ControlManifest.xml`,
        },
      },
    ];

    // const builder = new xml2js.Builder();
    const modifiedCustomizationXmlString =
      builder.buildObject(customizationsXml);
    console.log("show customzation");

    console.log(modifiedCustomizationXmlString);
    writeFileSync(customizationsPath, modifiedCustomizationXmlString);

    //
  });

program.parse(process.argv);
