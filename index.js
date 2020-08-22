"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const BabelParser = __importStar(require("@babel/parser"));
const traverse_1 = __importDefault(require("@babel/traverse"));
const make_dir_1 = __importDefault(require("make-dir"));
async function prompt(msg) {
    console.info(msg);
    const answer = await question('> ');
    return answer.trim();
}
async function question(question) {
    const readlineInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        readlineInterface.question(question, (answer) => {
            resolve(answer);
            readlineInterface.close();
        });
    });
}
async function getFileList(dirpath) {
    let fileList = [];
    const files = await fs_1.promises.readdir(dirpath);
    for (const file of files) {
        const fp = path.join(dirpath, file);
        const stats = await fs_1.promises.stat(fp);
        if (stats.isDirectory()) {
            const tempList = await getFileList(fp);
            fileList = fileList.concat(tempList);
        }
        else {
            // only vue file.
            if (/.+\.vue$/.test(fp))
                fileList.push(fp);
        }
    }
    return new Promise((resolve, reject) => {
        return resolve(fileList);
    });
}
class FileInfo {
    constructor(name, path, extension) {
        this._name = name;
        this._path = path;
        this._extension = extension;
    }
    get path() {
        return this._path;
    }
    get name() {
        return this._name;
    }
    get extension() {
        return this._extension;
    }
    /**
     * From the directory path character string,
     * the character string corresponding to the file name and extension is returned.
     *
     * @param dirPathStr directory path (example: 'hoge/fuga/piyo/target')
     * @return fileName, fileExtension
     */
    static create(dirPathStr) {
        let name = '';
        let extension = '';
        const matcher1 = dirPathStr.match(/([^/]+?)?$/);
        if (matcher1 && matcher1[1]) {
            const splitArr = matcher1[1].split('.');
            if (splitArr && splitArr[0]) {
                name = splitArr[0];
                if (splitArr[1]) {
                    extension = splitArr[1];
                }
            }
        }
        return new FileInfo(name, dirPathStr, extension);
    }
}
class VueComponentFileFactory {
    exec(fileStr, fileInfo) {
        let template = '';
        let script;
        let style = '';
        // template extraction
        let matchArr = fileStr.match(/<template.*?>([\s\S]*)<\/template>/);
        if (matchArr && matchArr[1])
            template = matchArr[1].concat();
        // script extraction
        matchArr = fileStr.match(/<script.*?>([\s\S]*)<\/script>/);
        if (matchArr && matchArr[1]) {
            const scriptStr = matchArr[1].concat();
            script = new VueComponentScript(scriptStr);
        }
        // style extraction
        matchArr = fileStr.match(/<style.*?>([\s\S]*)<\/style>/);
        if (matchArr && matchArr[1])
            style = matchArr[1].concat();
        return new VueComponentFile(fileInfo, template, script, style);
    }
}
class VueComponentInformation {
    // eslint-disable-next-line no-useless-constructor
    constructor() {
        this._vcfList = [];
        this._allComponentList = [];
        this._useComponentSet = new Set();
        this._unusedComponentList = [];
        this._removeComponentList = [];
    }
    get vcfList() {
        return this._vcfList;
    }
    get unusedComponentList() {
        return this._unusedComponentList;
    }
    static getInstance() {
        if (!VueComponentInformation.instance) {
            VueComponentInformation.instance = new VueComponentInformation();
        }
        return VueComponentInformation.instance;
    }
    update(vcfList) {
        this._vcfList = vcfList;
        let useComponentSet = new Set();
        let allComponentList = [];
        for (const vcf of vcfList) {
            vcf.script.importComponents.forEach(component => {
                useComponentSet.add(component);
            });
            allComponentList.push(vcf.fileInfo);
        }
        this._useComponentSet = useComponentSet;
        this._allComponentList = allComponentList;
        this._unusedComponentList = allComponentList.filter(component => !useComponentSet.has(component.name));
    }
    async removeUnusedComponent() {
        for (const component of this._unusedComponentList) {
            await fs_1.promises.unlink(component.path);
        }
        // Set as an array with deleted components
        this._removeComponentList = this._unusedComponentList.concat();
        this.update(this._vcfList);
    }
    async createReport() {
        if (this._removeComponentList.length === 0) {
            throw new Error('The list of removed components needed to create the report is missing.');
        }
        const makeDirPath = await make_dir_1.default(VueComponentInformation.REPORT_DIR);
        const reportPath = `${makeDirPath}/${this.dateToStr12HPad0(new Date())}.json`;
        await fs_1.promises.writeFile(reportPath, JSON.stringify(this._removeComponentList, null, 2));
        this._removeComponentList = [];
        return reportPath;
    }
    /**
     * Date string creation function
     *
     * @param date The Date you want to make a string
     * @param format Format of date string to be output
     * @see https://www.sejuku.net/blog/23064
     */
    dateToStr12HPad0(date, format = 'YYYYMMDD_hhmmss') {
        var hours = date.getHours();
        var ampm = hours < 12 ? 'AM' : 'PM';
        format = format.replace(/YYYY/g, String(date.getFullYear()));
        format = format.replace(/MM/g, ('0' + (date.getMonth() + 1)).slice(-2));
        format = format.replace(/DD/g, ('0' + date.getDate()).slice(-2));
        format = format.replace(/hh/g, ('0' + hours).slice(-2));
        format = format.replace(/mm/g, ('0' + date.getMinutes()).slice(-2));
        format = format.replace(/ss/g, ('0' + date.getSeconds()).slice(-2));
        format = format.replace(/AP/, ampm);
        return format;
    }
}
VueComponentInformation.REPORT_DIR = 'tools/UnusedComponentsRemover/report';
class VueComponentFile {
    constructor(fileInfo, template, script, style) {
        this._fileInfo = fileInfo;
        this._template = template;
        this._script = script;
        this._style = style;
    }
    get fileInfo() {
        return this._fileInfo;
    }
    get template() {
        return this._template;
    }
    get script() {
        return this._script;
    }
    get style() {
        return this._style;
    }
}
class VueComponentScript {
    constructor(scriptText) {
        this._importAll = [];
        this._importComponents = [];
        this._scriptText = scriptText;
        const ast = BabelParser.parse(scriptText, {
            plugins: [
                'jsx',
                'typescript',
                'classProperties',
                [
                    'decorators',
                    { 'decoratorsBeforeExport': true }
                ]
            ],
            sourceType: 'module'
        });
        let importAll = [];
        traverse_1.default(ast, {
            ImportDeclaration(path) {
                importAll.push(path.node.source.value);
            }
        });
        this._importAll = importAll;
        let importComponents = [];
        for (const importFile of importAll) {
            const fileNameInfo = FileInfo.create(importFile);
            if (fileNameInfo.extension === 'vue') {
                importComponents.push(fileNameInfo.name);
            }
        }
        this._importComponents = importComponents;
    }
    get importComponents() {
        return this._importComponents;
    }
}
(async () => {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const vueComponentFileFactory = new VueComponentFileFactory();
    const vueComponentInfomation = VueComponentInformation.getInstance();
    let files = await getFileList('src/components');
    let vcfList = [];
    for (const file of files) {
        const fileStr = await fs_1.promises.readFile(file, 'utf8');
        let fileInfo = FileInfo.create(file);
        const vcf = vueComponentFileFactory.exec(fileStr, fileInfo);
        vcfList.push(vcf);
    }
    vueComponentInfomation.update(vcfList);
    console.info(`All vue component files found: ${vueComponentInfomation.vcfList.length}`);
    console.info(`Unnecessary vue component files: ${vueComponentInfomation.unusedComponentList.length}`);
    const answer = await prompt('Are you sure you want to delete it? (y/n)');
    if (answer === 'y') {
        await vueComponentInfomation.removeUnusedComponent();
        const reportPath = await vueComponentInfomation.createReport();
        console.info('completed!');
        console.info('report path:');
        console.info(reportPath);
    }
    else {
        console.info('do nothing...');
    }
})();
