export namespace main {
	
	export class AppPackage {
	    id: string;
	    path: string;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new AppPackage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.type = source["type"];
	    }
	}
	export class BackupComponentMeta {
	    name: string;
	    type: string;
	    source: string;
	    path: string;
	    checksum: string;
	    size: number;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new BackupComponentMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.source = source["source"];
	        this.path = source["path"];
	        this.checksum = source["checksum"];
	        this.size = source["size"];
	        this.status = source["status"];
	    }
	}
	export class BackupItem {
	    id: string;
	    deviceName: string;
	    createdAt: string;
	    size: number;
	    sizeStr: string;
	    status: string;
	    filename: string;
	    components: BackupComponentMeta[];
	
	    static createFrom(source: any = {}) {
	        return new BackupItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.deviceName = source["deviceName"];
	        this.createdAt = source["createdAt"];
	        this.size = source["size"];
	        this.sizeStr = source["sizeStr"];
	        this.status = source["status"];
	        this.filename = source["filename"];
	        this.components = this.convertValues(source["components"], BackupComponentMeta);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BackupMetadata {
	    formatVersion: number;
	    appVersion: string;
	    deviceName: string;
	    deviceSerial: string;
	    createdAt: string;
	    checksum: string;
	    mode: string;
	    riskNote: string;
	    components: BackupComponentMeta[];
	    totalSize: number;
	    logs: string[];
	
	    static createFrom(source: any = {}) {
	        return new BackupMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.formatVersion = source["formatVersion"];
	        this.appVersion = source["appVersion"];
	        this.deviceName = source["deviceName"];
	        this.deviceSerial = source["deviceSerial"];
	        this.createdAt = source["createdAt"];
	        this.checksum = source["checksum"];
	        this.mode = source["mode"];
	        this.riskNote = source["riskNote"];
	        this.components = this.convertValues(source["components"], BackupComponentMeta);
	        this.totalSize = source["totalSize"];
	        this.logs = source["logs"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BackupSelectionOptions {
	    contacts: boolean;
	    sms: boolean;
	    appPackages: string[];
	    mediaFolders: string[];
	
	    static createFrom(source: any = {}) {
	        return new BackupSelectionOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.contacts = source["contacts"];
	        this.sms = source["sms"];
	        this.appPackages = source["appPackages"];
	        this.mediaFolders = source["mediaFolders"];
	    }
	}
	export class QuickActions {
	    rebootSystem: boolean;
	    rebootBootloader: boolean;
	    rebootRecovery: boolean;
	    rebootFastbootD: boolean;
	    lockBootloader: boolean;
	
	    static createFrom(source: any = {}) {
	        return new QuickActions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rebootSystem = source["rebootSystem"];
	        this.rebootBootloader = source["rebootBootloader"];
	        this.rebootRecovery = source["rebootRecovery"];
	        this.rebootFastbootD = source["rebootFastbootD"];
	        this.lockBootloader = source["lockBootloader"];
	    }
	}
	export class DeviceInfo {
	    serial: string;
	    state: string;
	    model?: string;
	    os: string;
	    build: string;
	    battery: string;
	    slot: string;
	    connected: boolean;
	    vendor: string;
	    bootloader: string;
	    actions: QuickActions;
	
	    static createFrom(source: any = {}) {
	        return new DeviceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serial = source["serial"];
	        this.state = source["state"];
	        this.model = source["model"];
	        this.os = source["os"];
	        this.build = source["build"];
	        this.battery = source["battery"];
	        this.slot = source["slot"];
	        this.connected = source["connected"];
	        this.vendor = source["vendor"];
	        this.bootloader = source["bootloader"];
	        this.actions = this.convertValues(source["actions"], QuickActions);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ExtractRequest {
	    romPath: string;
	    partitions: string[];
	    outputDir: string;
	
	    static createFrom(source: any = {}) {
	        return new ExtractRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.romPath = source["romPath"];
	        this.partitions = source["partitions"];
	        this.outputDir = source["outputDir"];
	    }
	}
	export class FlashReport {
	    sessionId: string;
	    startedAt: string;
	    endedAt: string;
	    deviceName: string;
	    vendor: string;
	    rom: string;
	    wipe: boolean;
	    arbMode: string;
	    result: string;
	    flashedPartitions: string[];
	    skippedArbPartitions: string[];
	    failures: string[];
	    logs: string[];
	
	    static createFrom(source: any = {}) {
	        return new FlashReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionId = source["sessionId"];
	        this.startedAt = source["startedAt"];
	        this.endedAt = source["endedAt"];
	        this.deviceName = source["deviceName"];
	        this.vendor = source["vendor"];
	        this.rom = source["rom"];
	        this.wipe = source["wipe"];
	        this.arbMode = source["arbMode"];
	        this.result = source["result"];
	        this.flashedPartitions = source["flashedPartitions"];
	        this.skippedArbPartitions = source["skippedArbPartitions"];
	        this.failures = source["failures"];
	        this.logs = source["logs"];
	    }
	}
	export class FlashReportSummary {
	    sessionId: string;
	    startedAt: string;
	    endedAt: string;
	    deviceName: string;
	    rom: string;
	    result: string;
	    vendor: string;
	
	    static createFrom(source: any = {}) {
	        return new FlashReportSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionId = source["sessionId"];
	        this.startedAt = source["startedAt"];
	        this.endedAt = source["endedAt"];
	        this.deviceName = source["deviceName"];
	        this.rom = source["rom"];
	        this.result = source["result"];
	        this.vendor = source["vendor"];
	    }
	}
	export class LibraryItem {
	    id: string;
	    name: string;
	    path: string;
	    size: string;
	    date: string;
	    type: string;
	    deviceTag: string;
	
	    static createFrom(source: any = {}) {
	        return new LibraryItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.size = source["size"];
	        this.date = source["date"];
	        this.type = source["type"];
	        this.deviceTag = source["deviceTag"];
	    }
	}
	export class LicenseResponse {
	    result: string;
	    type: string;
	    days_left: number;
	    expiry_ts: number;
	    message: string;
	    isPro: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LicenseResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.result = source["result"];
	        this.type = source["type"];
	        this.days_left = source["days_left"];
	        this.expiry_ts = source["expiry_ts"];
	        this.message = source["message"];
	        this.isPro = source["isPro"];
	    }
	}
	export class LicenseCacheEntry {
	    response: LicenseResponse;
	    checkedAt: number;
	    expiresAt: number;
	
	    static createFrom(source: any = {}) {
	        return new LicenseCacheEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.response = this.convertValues(source["response"], LicenseResponse);
	        this.checkedAt = source["checkedAt"];
	        this.expiresAt = source["expiresAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class PartitionInfo {
	    name: string;
	    size: number;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new PartitionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.size = source["size"];
	        this.type = source["type"];
	    }
	}
	export class PartitionItem {
	    id: number;
	    partition: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new PartitionItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.partition = source["partition"];
	        this.path = source["path"];
	    }
	}
	
	export class RestoreOptions {
	    dryRun: boolean;
	    selectedComponents: string[];
	
	    static createFrom(source: any = {}) {
	        return new RestoreOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dryRun = source["dryRun"];
	        this.selectedComponents = source["selectedComponents"];
	    }
	}
	export class RomInfo {
	    version: string;
	    android: string;
	    region: string;
	    type: string;
	    downloadUrl: string;
	    size: string;
	    date: string;
	
	    static createFrom(source: any = {}) {
	        return new RomInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.android = source["android"];
	        this.region = source["region"];
	        this.type = source["type"];
	        this.downloadUrl = source["downloadUrl"];
	        this.size = source["size"];
	        this.date = source["date"];
	    }
	}
	export class RomSourceAnalysis {
	    path: string;
	    name: string;
	    exists: boolean;
	    isDir: boolean;
	    isZip: boolean;
	    hasPayload: boolean;
	    imageCount: number;
	    sampleImages: string[];
	    sourceType: string;
	    prepareMode: string;
	    valid: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new RomSourceAnalysis(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.exists = source["exists"];
	        this.isDir = source["isDir"];
	        this.isZip = source["isZip"];
	        this.hasPayload = source["hasPayload"];
	        this.imageCount = source["imageCount"];
	        this.sampleImages = source["sampleImages"];
	        this.sourceType = source["sourceType"];
	        this.prepareMode = source["prepareMode"];
	        this.valid = source["valid"];
	        this.message = source["message"];
	    }
	}
	export class RootCapabilityReport {
	    hasRoot: boolean;
	    rootProvider: string;
	    suPath: string;
	    hasTar: boolean;
	    hasGzip: boolean;
	    hasToybox: boolean;
	    hasBusybox: boolean;
	    selinux: string;
	    androidSdk: string;
	    androidRelease: string;
	    dataFreeBytes: number;
	    sdcardFreeBytes: number;
	    multiUser: boolean;
	    users: string[];
	    warnings: string[];
	
	    static createFrom(source: any = {}) {
	        return new RootCapabilityReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasRoot = source["hasRoot"];
	        this.rootProvider = source["rootProvider"];
	        this.suPath = source["suPath"];
	        this.hasTar = source["hasTar"];
	        this.hasGzip = source["hasGzip"];
	        this.hasToybox = source["hasToybox"];
	        this.hasBusybox = source["hasBusybox"];
	        this.selinux = source["selinux"];
	        this.androidSdk = source["androidSdk"];
	        this.androidRelease = source["androidRelease"];
	        this.dataFreeBytes = source["dataFreeBytes"];
	        this.sdcardFreeBytes = source["sdcardFreeBytes"];
	        this.multiUser = source["multiUser"];
	        this.users = source["users"];
	        this.warnings = source["warnings"];
	    }
	}
	export class UpdateInfo {
	    hasUpdate: boolean;
	    latestVer: string;
	    currentVer: string;
	    link: string;
	    changelog: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasUpdate = source["hasUpdate"];
	        this.latestVer = source["latestVer"];
	        this.currentVer = source["currentVer"];
	        this.link = source["link"];
	        this.changelog = source["changelog"];
	    }
	}

}

