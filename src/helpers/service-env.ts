export interface ServiceConfig {
  exists: boolean;
  host: string;
  port: number;
  protocol: string;
  url: string | undefined;
}

export class ServiceEnv {

  static config(name: string, port: number): ServiceConfig {
    return {
      exists: ServiceEnv.exists(name, port),
      host: ServiceEnv.host(name, port),
      port: ServiceEnv.port(name, port),
      protocol: ServiceEnv.protocol(name, port),
      url: ServiceEnv.url(name, port)
    };
  }

  static addrEnv(name: string, port: number): string {
    return "" + name + "_PORT_" + port + "_TCP_ADDR";
  }

  static portEnv(name: string, port: number): string {
    return "" + name + "_PORT_" + port + "_TCP_PORT";
  }

  static protocolEnv(name: string, port: number): string {
    return "" + name + "_PORT_" + port + "_TCP_PROTOCOL";
  }

  static exists(name: string, port: number): boolean {
    return process.env.hasOwnProperty(this.addrEnv(name, port));
  }

  static url(name: string, port: number): string | undefined {
    var host, protocol, url;
    if (!this.exists(name, port)) {
      return void 0;
    } else {
      protocol = this.protocol(name, port);
      host = this.host(name, port);
      port = this.port(name, port);
      url = "" + protocol + "://" + host;
      if (!(protocol == 'http' && port == 80) && !(protocol == 'https' && port == 443)) {
        url += ":" + port;
      }
      return url;
    }
  };

  static host (name: string, port: number): string {
    return process.env[this.addrEnv(name, port)] || '127.0.0.1';
  };

  static port (name: string, port: number): number {
    return +(process.env[this.portEnv(name, port)] || port);
  };

  static protocol (name, port: number): string {
    return process.env[this.protocolEnv(name, port)] || 'http';
  };
}

export default ServiceEnv;